import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { ContextManager } from "../../src/context/context-manager.js";
import { MemoryManager } from "../../src/context/memory.js";
import { PromptBuilder } from "../../src/context/prompt-builder.js";
import { TokenManager } from "../../src/context/token-manager.js";
import { Message } from "../../src/llm/types.js";
import { MockLongTermMemoryStore } from "../support/mock-stores.js";

describe("Context & Token Management", () => {
  it("TokenManager estimates tokens accurately", () => {
    const tm = new TokenManager();
    const count = tm.estimateTokens("Hello world! This is a test.");
    assert.ok(count > 0 && count < 20);

    const msgs: Message[] = [
      { role: "user", content: "Hello world" },
      { role: "assistant", content: "Hi there!" },
    ];
    const total = tm.estimateMessagesTokens(msgs);
    assert.ok(total > 10);
  });

  it("ContextManager compacts history preserving system messages", () => {
    const cm = new ContextManager(3);
    const msgs: Message[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
      { role: "assistant", content: "4" },
    ];
    const compacted = cm.compact(msgs, { maxMessages: 2 });
    assert.strictEqual(compacted[0]?.role, "system");
    assert.strictEqual(compacted[0]?.content, "System prompt");
    assert.strictEqual(compacted.length, 3); // 1 system + 2 tail
  });

  it("PromptBuilder injects semantic memories", async () => {
    const store = new MockLongTermMemoryStore();
    const memory = new MemoryManager(store);
    await memory.remember("User prefers TypeScript and dark mode", { agentId: "agent-1" });

    const builder = new PromptBuilder("You are a helpful assistant.", memory);
    await builder.injectRelevantMemories("What language does user prefer?", "agent-1");

    const prompt = builder.buildSystemPrompt();
    assert.ok(prompt.includes("You are a helpful assistant."));
    assert.ok(prompt.includes("User prefers TypeScript"));
  });
});
