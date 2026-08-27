import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { HarnessEventBus } from "./event-bus.js";
import { HarnessEvent } from "./types.js";

describe("HarnessEventBus", () => {
  it("emits and subscribes to typed events", () => {
    const bus = new HarnessEventBus();
    const received: string[] = [];

    const unsubscribe = bus.on("run:start", (payload) => {
      received.push(payload.runId);
    });

    bus.emit("run:start", {
      runId: "test-run-1",
      agentId: "test-agent",
      input: "hello",
      timestamp: Date.now(),
    });

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0], "test-run-1");

    unsubscribe();

    bus.emit("run:start", {
      runId: "test-run-2",
      agentId: "test-agent",
      input: "hello again",
      timestamp: Date.now(),
    });

    assert.strictEqual(received.length, 1);
  });

  it("subscribes to run lifecycle events as an async iterable stream", async () => {
    const bus = new HarnessEventBus();
    const runId = "stream-run-100";

    const collectedEvents: HarnessEvent[] = [];

    // Consumer starts listening
    const streamPromise = (async () => {
      for await (const event of bus.subscribeToRun(runId)) {
        collectedEvents.push(event);
      }
    })();

    // Publisher emits sequence of events
    bus.emit("run:start", {
      runId,
      agentId: "agent-x",
      input: "Compute 2 + 2",
      timestamp: Date.now(),
    });

    bus.emit("token:delta", {
      runId,
      agentId: "agent-x",
      delta: "Let me ",
      timestamp: Date.now(),
    });

    bus.emit("token:delta", {
      runId,
      agentId: "agent-x",
      delta: "calculate that.",
      timestamp: Date.now(),
    });

    bus.emit("run:end", {
      runId,
      agentId: "agent-x",
      response: "Let me calculate that.",
      durationMs: 50,
      totalMessages: 3,
      timestamp: Date.now(),
    });

    await streamPromise;

    assert.strictEqual(collectedEvents.length, 4);
    assert.strictEqual(collectedEvents[0]?.type, "run:start");
    assert.strictEqual(collectedEvents[1]?.type, "token:delta");
    assert.strictEqual(collectedEvents[2]?.type, "token:delta");
    assert.strictEqual(collectedEvents[3]?.type, "run:end");
  });

  it("ignores events from other runIds in subscribeToRun", async () => {
    const bus = new HarnessEventBus();
    const targetRunId = "target-run";
    const otherRunId = "other-run";

    const collectedEvents: HarnessEvent[] = [];

    const streamPromise = (async () => {
      for await (const event of bus.subscribeToRun(targetRunId)) {
        collectedEvents.push(event);
      }
    })();

    bus.emit("run:start", {
      runId: otherRunId,
      agentId: "agent-other",
      input: "other input",
      timestamp: Date.now(),
    });

    bus.emit("run:start", {
      runId: targetRunId,
      agentId: "agent-target",
      input: "target input",
      timestamp: Date.now(),
    });

    bus.emit("run:end", {
      runId: targetRunId,
      agentId: "agent-target",
      response: "done",
      durationMs: 10,
      totalMessages: 2,
      timestamp: Date.now(),
    });

    await streamPromise;

    assert.strictEqual(collectedEvents.length, 2);
    assert.strictEqual(collectedEvents[0]?.payload.runId, targetRunId);
    assert.strictEqual(collectedEvents[1]?.payload.runId, targetRunId);
  });
});
