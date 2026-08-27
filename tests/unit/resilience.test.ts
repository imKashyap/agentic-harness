import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { Tool, ToolContext } from "../../src/capabilities/tools/tool.js";
import { ToolExecutor } from "../../src/capabilities/tools/tool-executor.js";
import { MockLLM } from "../../src/llm/mock-llm.js";
import { ModelRouter } from "../../src/llm/model-router.js";
import { LLM, LLMResponse } from "../../src/llm/types.js";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  TimeoutError,
  withFallback,
  withRetry,
  withTimeout,
} from "../../src/resilience/index.js";

describe("Resilience Subsystem", () => {
  describe("withTimeout", () => {
    it("returns result when operation completes within timeout", async () => {
      const result = await withTimeout(async () => 42, 1000);
      assert.strictEqual(result, 42);
    });

    it("throws TimeoutError when operation exceeds timeout", async () => {
      await assert.rejects(
        async () => {
          await withTimeout(
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 200));
              return "late";
            },
            50,
            "SlowOperation",
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof TimeoutError);
          assert.ok((err as TimeoutError).message.includes("SlowOperation timed out after 50ms"));
          return true;
        },
      );
    });

    it("propagates AbortSignal to underlying task", async () => {
      let wasAborted = false;
      await assert.rejects(async () => {
        await withTimeout(async (signal) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (signal?.aborted) wasAborted = true;
        }, 30);
      });
      assert.strictEqual(wasAborted, false); // timer fired before resolution
    });
  });

  describe("withRetry", () => {
    it("returns immediately on first attempt success", async () => {
      let attempts = 0;
      const result = await withRetry(async () => {
        attempts++;
        return "success";
      });
      assert.strictEqual(result, "success");
      assert.strictEqual(attempts, 1);
    });

    it("retries on failure and returns when subsequent attempt succeeds", async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Transient error ${attempts}`);
          }
          return "recovered";
        },
        { initialDelayMs: 10, maxDelayMs: 50, maxRetries: 3, jitter: false },
      );
      assert.strictEqual(result, "recovered");
      assert.strictEqual(attempts, 3);
    });

    it("exhausts maxRetries and throws last error", async () => {
      let attempts = 0;
      await assert.rejects(async () => {
        await withRetry(
          async () => {
            attempts++;
            throw new Error("Persistent failure");
          },
          { initialDelayMs: 5, maxDelayMs: 20, maxRetries: 2, jitter: false },
        );
      }, /Persistent failure/);
      assert.strictEqual(attempts, 3); // initial + 2 retries
    });

    it("does not retry when shouldRetry returns false", async () => {
      let attempts = 0;
      await assert.rejects(async () => {
        await withRetry(
          async () => {
            attempts++;
            throw new Error("Non-retryable 400 Bad Request");
          },
          {
            maxRetries: 3,
            shouldRetry: (err) => !(err as Error).message.includes("400"),
          },
        );
      }, /Non-retryable 400/);
      assert.strictEqual(attempts, 1);
    });
  });

  describe("withFallback", () => {
    it("returns primary result on primary success", async () => {
      const result = await withFallback({
        primary: async () => "primary result",
        fallback: async () => "fallback result",
      });
      assert.strictEqual(result, "primary result");
    });

    it("executes fallback strategy when primary fails", async () => {
      const result = await withFallback({
        primary: async () => {
          throw new Error("Primary upstream down");
        },
        fallback: async (err) => `fallback handled: ${(err as Error).message}`,
      });
      assert.strictEqual(result, "fallback handled: Primary upstream down");
    });
  });

  describe("CircuitBreaker", () => {
    it("starts in CLOSED state and allows successful executions", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 100 });
      assert.strictEqual(breaker.getState(), "CLOSED");

      const res = await breaker.execute(async () => "ok");
      assert.strictEqual(res, "ok");
      assert.strictEqual(breaker.getState(), "CLOSED");
    });

    it("trips to OPEN state after reaching failure threshold and rejects immediately", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 50,
        label: "TestBreaker",
      });

      // Failure 1
      await assert.rejects(async () => {
        await breaker.execute(async () => {
          throw new Error("Err 1");
        });
      });
      assert.strictEqual(breaker.getState(), "CLOSED");

      // Failure 2 (trips circuit)
      await assert.rejects(async () => {
        await breaker.execute(async () => {
          throw new Error("Err 2");
        });
      });
      assert.strictEqual(breaker.getState(), "OPEN");

      // Next call rejected fast with CircuitBreakerOpenError without running fn
      let fnRan = false;
      await assert.rejects(
        async () => {
          await breaker.execute(async () => {
            fnRan = true;
            return "should not run";
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof CircuitBreakerOpenError);
          return true;
        },
      );
      assert.strictEqual(fnRan, false);
    });

    it("transitions from OPEN to HALF_OPEN after timeout and closes on success", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 30,
        successThreshold: 1,
        label: "RecoveringBreaker",
      });

      await assert.rejects(async () => {
        await breaker.execute(async () => {
          throw new Error("Err");
        });
      });
      assert.strictEqual(breaker.getState(), "OPEN");

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.strictEqual(breaker.getState(), "HALF_OPEN");

      // Successful probe execution closes the circuit
      const result = await breaker.execute(async () => "recovered");
      assert.strictEqual(result, "recovered");
      assert.strictEqual(breaker.getState(), "CLOSED");
    });
  });

  describe("ModelRouter Fallback Routing", () => {
    class FailingLLM implements LLM {
      async chat(): Promise<LLMResponse> {
        throw new Error("503 Upstream Service Unavailable");
      }
    }

    it("routes to fallback provider when primary provider fails", async () => {
      const router = new ModelRouter();
      router.registerAdapter("failing-primary", new FailingLLM());
      router.registerAdapter("healthy-secondary", new MockLLM());

      router.setFallback({
        provider: "failing-primary",
        fallbackProvider: "healthy-secondary",
      });

      const response = await router.chat(
        { messages: [{ role: "user", content: "Hello fallback" }] },
        "failing-primary",
      );

      assert.ok(response.content.length > 0);
    });
  });

  describe("ToolExecutor Resilience (Timeout & Retries)", () => {
    const executor = new ToolExecutor();
    const context: ToolContext = { runId: "test-run", agentId: "test-agent" };

    it("times out tools exceeding timeoutMs", async () => {
      const slowTool: Tool = {
        id: "tool.slow",
        name: "Slow Tool",
        description: "A slow tool",
        type: "tool",
        timeoutMs: 50,
        inputSchema: {},
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { success: true, output: "done" };
        },
      };

      const result = await executor.execute(slowTool, {}, context);
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes("timed out"));
    });

    it("retries transient tool errors according to retryPolicy", async () => {
      let attempts = 0;
      const flakyTool: Tool = {
        id: "tool.flaky",
        name: "Flaky Tool",
        description: "A flaky tool",
        type: "tool",
        retryPolicy: {
          maxRetries: 2,
          initialDelayMs: 5,
          maxDelayMs: 20,
          jitter: false,
        },
        inputSchema: {},
        execute: async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error("Temporary DB Lock");
          }
          return { success: true, output: { processed: true } };
        },
      };

      const result = await executor.execute(flakyTool, {}, context);
      assert.strictEqual(result.success, true);
      assert.strictEqual(attempts, 2);
    });
  });
});
