import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CapabilityResolver } from "../../src/capabilities/resolution/capability-resolver.js";
import { AgentHarness } from "../../src/core/harness.js";
import { StaticPlanGenerator } from "../../src/core/orchestration/static-plan-generator.js";
import { PromptProvider } from "../../src/prompts/prompt-provider.js";
import { withMockPersistence } from "../support/mock-stores.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: req.version ?? "v1",
      content: `Prompt for ${req.id}`,
    };
  },
};

describe("Supervisor with Summarizer Sub-Agent Integration", () => {
  it("initializes harness and discovers summarizer agent as runnable and as a capability", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    // Verify summarizer is registered as runnable agent
    assert.ok(harness.agentRegistry.has("summarizer"), "summarizer should be in AgentRegistry");
    const summarizerAgent = harness.getAgent("summarizer");
    assert.equal(summarizerAgent.id, "summarizer");

    // Verify summarizer is registered in CapabilityRegistry
    assert.ok(
      harness.capabilityRegistry.has("agent.summarizer"),
      "agent.summarizer should be in CapabilityRegistry",
    );
    const summarizerCap = harness.capabilityRegistry.getAgent("agent.summarizer");
    assert.equal(summarizerCap.id, "agent.summarizer");
    assert.equal(summarizerCap.name, "Summarizer");
  });

  it("resolves agent.summarizer in supervisor allowed sub-agents", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    const resolver = new CapabilityResolver();
    const supervisor = harness.getAgent("supervisor");

    const subAgents = resolver.resolveAgentsForAgent(supervisor.config, harness.capabilityRegistry);
    const subAgentIds = subAgents.map((a) => a.id);

    assert.ok(
      subAgentIds.includes("agent.summarizer"),
      "supervisor sub-agents must include agent.summarizer",
    );
    assert.ok(
      subAgentIds.includes("agent.travel-planner"),
      "supervisor sub-agents must include agent.travel-planner",
    );
  });
});
