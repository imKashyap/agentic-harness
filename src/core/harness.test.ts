import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { MockRelationalDb, withMockPersistence } from "../../tests/support/mock-stores.js";
import { CalculatorTool } from "../capabilities/tools/examples/calculator-tool.js";
import { AgentNotFoundError } from "../errors/orchestration-errors.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { AgentConfig } from "./agent/agent-config.js";
import { AgentHarness } from "./harness.js";
import { StaticPlanGenerator } from "./orchestration/static-plan-generator.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: req.version ?? "v1",
      content: "You are a test agent in the harness.",
    };
  },
};

describe("AgentHarness Facade (Server-Ready API)", () => {
  it("fails initialization when PostgreSQL is unavailable", async () => {
    const relationalDb = new MockRelationalDb();
    relationalDb.initialize = async () => {
      throw new Error("PostgreSQL unavailable");
    };

    await assert.rejects(
      () => AgentHarness.init(withMockPersistence({ relationalDb })),
      /PostgreSQL unavailable/,
    );
  });

  it("initializes successfully with custom tools and mock prompt provider", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        tools: [new CalculatorTool()],
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    assert.ok(harness.capabilityRegistry);
    assert.ok(harness.agentRegistry);
    assert.ok(harness.orchestrator);
    assert.ok(harness.capabilityRegistry.has("tool.calculator"));
  });

  it("allows dynamic registration of tools, skills, and agents", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        tools: [],
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    // Register tool
    harness.registerTool(new CalculatorTool());
    assert.strictEqual(harness.capabilityRegistry.has("tool.calculator"), true);

    // Register skill
    harness.registerSkill({
      id: "skill.test",
      name: "Test Skill",
      description: "A test skill",
      type: "skill",
      content: "Test skill instructions",
      metadata: {},
    });
    assert.strictEqual(harness.capabilityRegistry.has("skill.test"), true);

    // Register dynamic agent
    const dynamicConfig: AgentConfig = {
      id: "dynamic-agent",
      name: "Dynamic Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "dynamic-prompt" },
      skills: ["skill.test"],
      tools: ["tool.calculator"],
      subAgents: [],
    };

    const agent = harness.registerAgent(dynamicConfig);
    assert.strictEqual(agent.id, "dynamic-agent");
    assert.strictEqual(harness.getAgent("dynamic-agent").id, "dynamic-agent");

    const agents = harness.listAgents();
    assert.ok(agents.some((a) => a.id === "dynamic-agent"));

    const capabilities = harness.listCapabilities();
    assert.ok(capabilities.some((c) => c.id === "tool.calculator"));
    assert.ok(capabilities.some((c) => c.id === "skill.test"));
  });

  it("runs an agent through the harness facade and handles unknown agents", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        tools: [new CalculatorTool()],
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    const mockConfig: AgentConfig = {
      id: "echo-agent",
      name: "Echo Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "echo-prompt" },
      skills: [],
      tools: [],
      subAgents: [],
    };

    harness.registerAgent(mockConfig);

    const result = await harness.runAgent("echo-agent", "Hello harness!");
    assert.match(result.response, /Mock response to: Hello harness!/);

    await assert.rejects(
      () => harness.runAgent("non-existent-agent", "Hello"),
      (err: unknown) => err instanceof AgentNotFoundError,
    );
  });
});
