import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CapabilityLoader } from "../../src/capabilities/capability-loader.js";
import { SkillCapabilityLoader } from "../../src/capabilities/skills/skill-capability-loader.js";
import { ToolCapabilityLoader } from "../../src/capabilities/tools/tool-capability-loader.js";

describe("CapabilityLoader (Agent-Driven Discovery & Deduplication)", () => {
  it("discovers all agents and loads declared tools and skills", async () => {
    const loader = new CapabilityLoader({
      agentsDir: "./agents",
      toolsDir: "./tools",
      skillsDir: "./skills",
    });

    const capabilities = await loader.loadAll();
    const capabilityIds = capabilities.map((c) => c.id);

    // Verify agents discovered
    assert.ok(capabilityIds.includes("agent.supervisor"), "Should discover supervisor agent");
    assert.ok(
      capabilityIds.includes("agent.travel-planner"),
      "Should discover travel-planner agent",
    );
    assert.ok(
      capabilityIds.includes("agent.destination-researcher"),
      "Should discover destination-researcher agent",
    );
    assert.ok(capabilityIds.includes("agent.summarizer"), "Should discover summarizer agent");

    // Verify tools discovered via agent declarations
    assert.ok(capabilityIds.includes("tool.search_places"), "Should load tool.search_places");
    assert.ok(capabilityIds.includes("tool.get_weather"), "Should load tool.get_weather");
    assert.ok(
      capabilityIds.includes("tool.calculate_trip_budget"),
      "Should load tool.calculate_trip_budget",
    );
    assert.ok(capabilityIds.includes("tool.cowsay"), "Should load tool.cowsay");

    // Verify skills discovered via agent declarations
    assert.ok(
      capabilityIds.includes("skill.itinerary_planning"),
      "Should load skill.itinerary_planning",
    );
    assert.ok(
      capabilityIds.includes("skill.travel_budgeting"),
      "Should load skill.travel_budgeting",
    );

    // Verify discovered agent configs are exposed for AgentRegistry instantiation
    const agentConfigs = loader.getDiscoveredAgentConfigs();
    const configIds = agentConfigs.map((c) => c.id);
    assert.ok(configIds.includes("supervisor"));
    assert.ok(configIds.includes("travel-planner"));
    assert.ok(configIds.includes("destination-researcher"));
    assert.ok(configIds.includes("summarizer"));
  });

  it("deduplicates and caches shared tools between multiple subagents", async () => {
    const toolLoader = new ToolCapabilityLoader("./tools");

    // First load of search_places (as requested by travel-planner)
    const tool1 = await toolLoader.load("tool.search_places");
    assert.ok(tool1 !== null);
    assert.equal(tool1.id, "tool.search_places");

    // Second load of search_places (as requested by destination-researcher)
    const tool2 = await toolLoader.load("search_places");
    assert.ok(tool2 !== null);

    // Must be the exact same cached reference (no re-reading disk)
    assert.strictEqual(tool1, tool2, "Shared tool should return identical cached instance");
  });

  it("deduplicates and caches shared skills between multiple agents", async () => {
    const skillLoader = new SkillCapabilityLoader("./skills");

    // First load
    const skill1 = await skillLoader.load("skill.itinerary_planning");
    assert.ok(skill1 !== null);
    assert.equal(skill1.id, "skill.itinerary_planning");

    // Second load with short name
    const skill2 = await skillLoader.load("itinerary_planning");
    assert.ok(skill2 !== null);

    // Must be the exact same cached reference
    assert.strictEqual(skill1, skill2, "Shared skill should return identical cached instance");
  });

  it("handles non-existent tools and skills gracefully without throwing", async () => {
    const toolLoader = new ToolCapabilityLoader("./tools");
    const skillLoader = new SkillCapabilityLoader("./skills");

    const nonExistentTool = await toolLoader.load("tool.non_existent_tool_123");
    assert.strictEqual(nonExistentTool, null);

    const nonExistentSkill = await skillLoader.load("skill.non_existent_skill_123");
    assert.strictEqual(nonExistentSkill, null);
  });
});
