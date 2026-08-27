import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { AgentConfig } from "../core/agent/agent-config.js";
import { AgentHarness } from "../core/harness.js";
import { StaticPlanGenerator } from "../core/orchestration/static-plan-generator.js";
import { HarnessEvent } from "../events/types.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { MockLLM } from "./adapters/mock/mock-llm.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: "v1",
      content: "You are a test streaming agent.",
    };
  },
};

describe("MockLLM Streaming", () => {
  it("yields token chunks and full response", async () => {
    const llm = new MockLLM();
    const chunks: string[] = [];

    const stream = llm.chatStream({
      messages: [{ role: "user", content: "World" }],
    });

    for await (const chunk of stream) {
      if (chunk.delta) {
        chunks.push(chunk.delta);
      }
      if (chunk.fullResponse) {
        assert.strictEqual(chunk.fullResponse.content, "Mock response to: World");
      }
    }

    assert.ok(chunks.length > 1);
    assert.strictEqual(chunks.join(""), "Mock response to: World");
  });
});

describe("AgentHarness runAgentStream()", () => {
  it("streams real-time tokens and lifecycle events for an agent turn", async () => {
    const harness = await AgentHarness.init({
      tools: [],
      planGenerator: new StaticPlanGenerator(),
      promptProvider: mockPromptProvider,
    });

    const config: AgentConfig = {
      id: "stream-agent",
      name: "Stream Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "stream-prompt" },
      skills: [],
      tools: [],
      subAgents: [],
    };

    harness.registerAgent(config);

    const receivedEvents: HarnessEvent[] = [];

    for await (const event of harness.runAgentStream("stream-agent", "Testing streaming")) {
      receivedEvents.push(event);
    }

    assert.ok(receivedEvents.length >= 3);

    const types = receivedEvents.map((e) => e.type);
    assert.ok(types.includes("run:start"));
    assert.ok(types.includes("token:delta"));
    assert.ok(types.includes("run:end"));

    const tokenEvents = receivedEvents.filter((e) => e.type === "token:delta");
    assert.ok(tokenEvents.length > 0);
  });
});
