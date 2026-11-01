import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { formatProgressMessage } from "../../src/capabilities/progressive-message.js";
import { HarnessEventBus } from "../../src/events/event-bus.js";
import { HarnessEvent, ProgressiveMessagePayload } from "../../src/events/types.js";

describe("Progressive Message System", () => {
  it("formats progressive messages for various capabilities naturally", () => {
    // GitHub
    assert.strictEqual(
      formatProgressMessage("tool.github", { repo: "org/repo" }),
      "Querying GitHub repository (org/repo)...",
    );
    assert.strictEqual(formatProgressMessage("tool.github"), "Interacting with GitHub...");

    // Slack
    assert.strictEqual(
      formatProgressMessage("tool.slack", { channel: "dev-alerts" }),
      "Posting message to Slack #dev-alerts...",
    );

    // Jira
    assert.strictEqual(
      formatProgressMessage("tool.jira", { issueKey: "PROJ-101" }),
      "Fetching Jira issue PROJ-101...",
    );

    // Search
    assert.strictEqual(
      formatProgressMessage("tool.search", { query: "latest release notes" }),
      'Searching for "latest release notes"...',
    );

    // Subagent capability formatting remains generic.
    assert.strictEqual(
      formatProgressMessage("agent.test-specialist", { task: "survey database engines" }),
      "Consulting specialist agent 'test-specialist' on \"survey database engines\"...",
    );

    // Generic camelCase / snake_case
    assert.strictEqual(
      formatProgressMessage("tool.fetch_user_profile"),
      "Running fetch user profile...",
    );

    // Custom tool progressMessage
    assert.strictEqual(
      formatProgressMessage("tool.custom", { id: 1 }, "Custom progress active..."),
      "Custom progress active...",
    );
    assert.strictEqual(
      formatProgressMessage(
        "tool.custom",
        { id: 42 },
        (inp) => `Inspecting item #${(inp as { id: number }).id}...`,
      ),
      "Inspecting item #42...",
    );
  });

  it("emits and receives progressive:message events over HarnessEventBus", async () => {
    const bus = new HarnessEventBus();
    const runId = "prog-run-1";
    const collected: HarnessEvent[] = [];

    const streamPromise = (async () => {
      for await (const event of bus.subscribeToRun(runId)) {
        collected.push(event);
      }
    })();

    bus.emit("run:start", {
      runId,
      agentId: "agent-main",
      input: "Fetch the project status",
      timestamp: Date.now(),
    });

    bus.emit("progressive:message", {
      runId,
      agentId: "agent-main",
      stage: "action",
      capability: "tool.github",
      message: "Interacting with GitHub...",
      timestamp: Date.now(),
    });

    bus.emit("run:end", {
      runId,
      agentId: "agent-main",
      response: "5760",
      durationMs: 120,
      totalMessages: 3,
      timestamp: Date.now(),
    });

    await streamPromise;

    assert.strictEqual(collected.length, 3);
    assert.strictEqual(collected[1]?.type, "progressive:message");
    const progPayload = collected[1]?.payload as ProgressiveMessagePayload;
    assert.strictEqual(progPayload.message, "Interacting with GitHub...");
    assert.strictEqual(progPayload.stage, "action");
  });
});
