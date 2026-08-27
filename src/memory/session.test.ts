import "reflect-metadata";

import assert from "node:assert";
import { promises as fs } from "node:fs";
import { describe, it } from "node:test";

import { CalculatorTool } from "../capabilities/tools/examples/calculator-tool.js";
import { AgentConfig } from "../core/agent/agent-config.js";
import { AgentHarness } from "../core/harness.js";
import { StaticPlanGenerator } from "../core/orchestration/static-plan-generator.js";
import { Message } from "../llm/types.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { ContextCompactor } from "./session/context-compactor.js";
import { FileSessionStore } from "./session/file-session-store.js";
import { InMemorySessionStore } from "./session/in-memory-session-store.js";
import { Session } from "./types.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: "v1",
      content: "You are a test memory agent.",
    };
  },
};

describe("InMemorySessionStore", () => {
  it("saves, retrieves, lists, and deletes sessions", async () => {
    const store = new InMemorySessionStore();

    const session1: Session = {
      id: "sess-1",
      agentId: "agent-a",
      messages: [{ role: "user", content: "Hello" }],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const session2: Session = {
      id: "sess-2",
      agentId: "agent-b",
      messages: [{ role: "user", content: "Hi" }],
      createdAt: 2000,
      updatedAt: 2000,
    };

    await store.save(session1);
    await store.save(session2);

    const retrieved = await store.get("sess-1");
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, "sess-1");
    assert.strictEqual(retrieved.messages.length, 1);

    const all = await store.list();
    assert.strictEqual(all.length, 2);

    const agentFiltered = await store.list("agent-a");
    assert.strictEqual(agentFiltered.length, 1);
    assert.strictEqual(agentFiltered[0]?.id, "sess-1");

    const deleted = await store.delete("sess-1");
    assert.strictEqual(deleted, true);
    assert.strictEqual(await store.get("sess-1"), null);
  });
});

describe("FileSessionStore", () => {
  const testDir = "./scratch/test-sessions";

  it("persists sessions to disk and reads them back", async () => {
    const store = new FileSessionStore(testDir);

    const session: Session = {
      id: "disk-sess-1",
      agentId: "test-agent",
      messages: [
        { role: "user", content: "Hello file store" },
        { role: "assistant", content: "Hello from disk" },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await store.save(session);

    const loaded = await store.get("disk-sess-1");
    assert.ok(loaded);
    assert.strictEqual(loaded.id, "disk-sess-1");
    assert.strictEqual(loaded.messages.length, 2);
    assert.strictEqual(loaded.messages[1]?.content, "Hello from disk");

    const list = await store.list();
    assert.ok(list.some((s) => s.id === "disk-sess-1"));

    await store.delete("disk-sess-1");
    assert.strictEqual(await store.get("disk-sess-1"), null);

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });
});

describe("ContextCompactor", () => {
  it("compacts messages while preserving system prompt and tool-call pairs", () => {
    const compactor = new ContextCompactor(5);

    const messages: Message[] = [
      { role: "system", content: "System instructions" },
      { role: "user", content: "msg 1" },
      { role: "assistant", content: "msg 2" },
      { role: "user", content: "msg 3" },
      {
        role: "assistant",
        content: "calling tool",
        toolCalls: [{ id: "call-1", name: "calculator", arguments: {} }],
      },
      { role: "tool", toolCallId: "call-1", name: "calculator", content: "42" },
      { role: "assistant", content: "final 42" },
    ];

    const compacted = compactor.compact(messages, { maxMessages: 4 });

    // Must retain system prompt
    assert.strictEqual(compacted[0]?.role, "system");

    // Must never have orphan 'tool' response as first non-system message
    const firstNonSystem = compacted[1];
    assert.notStrictEqual(firstNonSystem?.role, "tool");

    // Total messages must be <= original
    assert.ok(compacted.length <= messages.length);
  });
});

describe("Multi-Turn Session Memory in AgentHarness", () => {
  it("maintains conversational history across multi-turn runs", async () => {
    const sessionStore = new InMemorySessionStore();
    const harness = await AgentHarness.init({
      tools: [new CalculatorTool()],
      planGenerator: new StaticPlanGenerator(),
      promptProvider: mockPromptProvider,
      sessionStore,
    });

    const config: AgentConfig = {
      id: "conversational-agent",
      name: "Conversational Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "conv-prompt" },
      skills: [],
      tools: [],
      subAgents: [],
    };

    harness.registerAgent(config);

    const sessionId = "turn-session-123";

    // Turn 1
    const res1 = await harness.runAgent("conversational-agent", "My favorite color is Blue", {
      sessionId,
    });
    assert.ok(res1.response);
    assert.strictEqual(res1.messages.length, 3); // system, user, assistant

    // Check saved session
    const saved1 = await harness.getSession(sessionId);
    assert.ok(saved1);
    assert.strictEqual(saved1.messages.length, 3);

    // Turn 2
    const res2 = await harness.runAgent("conversational-agent", "What is my favorite color?", {
      sessionId,
    });
    assert.ok(res2.response);
    assert.strictEqual(res2.messages.length, 5); // system, user1, assistant1, user2, assistant2

    // Check updated session
    const saved2 = await harness.getSession(sessionId);
    assert.ok(saved2);
    assert.strictEqual(saved2.messages.length, 5);
  });
});
