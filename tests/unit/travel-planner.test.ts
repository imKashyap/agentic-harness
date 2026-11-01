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

describe("Travel Planner Ecosystem Integration", () => {
  it("initializes harness and auto-discovers all travel agents, tools, and skills", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    // Verify all 3 agents are registered in AgentRegistry as runnable instances
    assert.ok(harness.agentRegistry.has("supervisor"), "supervisor should be in AgentRegistry");
    assert.ok(
      harness.agentRegistry.has("travel-planner"),
      "travel-planner should be in AgentRegistry",
    );
    assert.ok(
      harness.agentRegistry.has("destination-researcher"),
      "destination-researcher should be in AgentRegistry",
    );

    // Verify all tools are loaded into CapabilityRegistry
    assert.ok(
      harness.capabilityRegistry.has("tool.search_places"),
      "search_places should be in CapabilityRegistry",
    );
    assert.ok(
      harness.capabilityRegistry.has("tool.get_weather"),
      "get_weather should be in CapabilityRegistry",
    );
    assert.ok(
      harness.capabilityRegistry.has("tool.calculate_trip_budget"),
      "calculate_trip_budget should be in CapabilityRegistry",
    );

    // Verify all skills are loaded into CapabilityRegistry
    assert.ok(
      harness.capabilityRegistry.has("skill.itinerary_planning"),
      "itinerary_planning should be in CapabilityRegistry",
    );
    assert.ok(
      harness.capabilityRegistry.has("skill.travel_budgeting"),
      "travel_budgeting should be in CapabilityRegistry",
    );
  });

  it("strictly enforces capability allowlists for travel-planner vs destination-researcher", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    const resolver = new CapabilityResolver();

    const travelPlannerAgent = harness.getAgent("travel-planner");
    const destResearcherAgent = harness.getAgent("destination-researcher");

    // 1. Check travel-planner allowed capabilities
    const tpTools = resolver.resolveToolsForAgent(
      travelPlannerAgent.config,
      harness.capabilityRegistry,
    );
    const tpToolIds = tpTools.map((t) => t.id);

    assert.ok(tpToolIds.includes("tool.search_places"));
    assert.ok(tpToolIds.includes("tool.get_weather"));
    assert.ok(tpToolIds.includes("tool.calculate_trip_budget"));
    assert.ok(tpToolIds.includes("tool.remember_fact"), "Memory save tool should be resolved");
    assert.ok(tpToolIds.includes("tool.search_memory"), "Memory search tool should be resolved");

    const tpSkills = resolver.resolveSkillsForAgent(
      travelPlannerAgent.config,
      harness.capabilityRegistry,
    );
    const tpSkillIds = tpSkills.map((s) => s.id);
    assert.ok(tpSkillIds.includes("skill.itinerary_planning"));
    assert.ok(tpSkillIds.includes("skill.travel_budgeting"));

    const tpSubAgents = resolver.resolveAgentsForAgent(
      travelPlannerAgent.config,
      harness.capabilityRegistry,
    );
    assert.equal(tpSubAgents.length, 1);
    assert.equal(tpSubAgents[0]!.id, "agent.destination-researcher");

    // 2. Check destination-researcher allowed capabilities
    const drTools = resolver.resolveToolsForAgent(
      destResearcherAgent.config,
      harness.capabilityRegistry,
    );
    const drToolIds = drTools.map((t) => t.id);

    assert.ok(drToolIds.includes("tool.search_places"));
    assert.ok(drToolIds.includes("tool.get_weather"));
    assert.ok(
      !drToolIds.includes("tool.calculate_trip_budget"),
      "destination-researcher must NOT have access to calculate_trip_budget",
    );
    assert.ok(
      !drToolIds.includes("tool.remember_fact"),
      "destination-researcher must NOT have access to remember_fact (save=false)",
    );

    const drSubAgents = resolver.resolveAgentsForAgent(
      destResearcherAgent.config,
      harness.capabilityRegistry,
    );
    assert.equal(drSubAgents.length, 0, "destination-researcher must have 0 subagents");
  });

  it("executes travel tools through CapabilityRegistry with expected output schemas", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        planGenerator: new StaticPlanGenerator(),
        promptProvider: mockPromptProvider,
      }),
    );

    const context = { runId: "test-run", agentId: "travel-planner" };

    // Search places
    const searchPlacesTool = harness.capabilityRegistry.getTool("tool.search_places");
    const placesResult = await searchPlacesTool.execute({ location: "Kyoto", limit: 3 }, context);
    assert.equal(placesResult.success, true);
    assert.ok((placesResult.output as { places: unknown[] }).places.length > 0);

    // Weather
    const weatherTool = harness.capabilityRegistry.getTool("tool.get_weather");
    const weatherResult = await weatherTool.execute(
      { location: "Kyoto", seasonOrMonth: "autumn" },
      context,
    );
    assert.equal(weatherResult.success, true);
    assert.ok(
      (weatherResult.output as { temperature: { highCelsius: number } }).temperature.highCelsius >
        0,
    );

    // Budget
    const budgetTool = harness.capabilityRegistry.getTool("tool.calculate_trip_budget");
    const budgetResult = await budgetTool.execute(
      { destination: "Kyoto", durationDays: 5, travelStyle: "moderate" },
      context,
    );
    assert.equal(budgetResult.success, true);
    assert.ok(
      (budgetResult.output as { summary: { totalEstimatedCost: number } }).summary
        .totalEstimatedCost > 0,
    );
  });
});
