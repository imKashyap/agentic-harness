import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { HarnessEventBus } from "../../src/observability/events.js";
import { MetricsService } from "../../src/observability/metrics.js";
import { TracingService } from "../../src/observability/tracing.js";

describe("Observability Services", () => {
  it("TracingService creates, tracks, and ends spans", async () => {
    const tracing = new TracingService();
    const result = await tracing.traceAsync("test-operation", async (span) => {
      assert.strictEqual(span.name, "test-operation");
      assert.strictEqual(span.status, "ok");
      return 42;
    });
    assert.strictEqual(result, 42);
  });

  it("MetricsService records run durations and token summaries", () => {
    const metrics = new MetricsService();
    metrics.recordRun(true, 150, 500);
    metrics.recordRun(true, 250, 300);
    metrics.recordRun(false, 100, 0);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.totalRuns, 3);
    assert.strictEqual(summary.successfulRuns, 2);
    assert.strictEqual(summary.failedRuns, 1);
    assert.strictEqual(summary.totalTokens, 800);
    assert.ok(summary.avgDurationMs > 0);
  });

  it("HarnessEventBus emits and streams typed events", async () => {
    const bus = new HarnessEventBus();
    const stream = bus.subscribe("run-1");

    setTimeout(() => {
      bus.emit("run:start", {
        runId: "run-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        input: "Hi",
      });
      bus.emit("token:delta", {
        runId: "run-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        delta: "Hello",
      });
      bus.emit("run:end", {
        runId: "run-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        response: "Hello",
        durationMs: 10,
        totalMessages: 2,
      });
    }, 10);

    const received: string[] = [];
    for await (const event of stream) {
      received.push(event.type);
    }

    assert.deepStrictEqual(received, ["run:start", "token:delta", "run:end"]);
  });
});
