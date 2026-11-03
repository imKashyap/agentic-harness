import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AgentCapability } from "../agents/agent-capability.js";
import { Skill } from "../skills/skill.js";
import { Tool } from "../tools/tool.js";
import { CapabilityResolver } from "./capability-resolver.js";

describe("CapabilityResolver Prompt Formatting", () => {
  const resolver = new CapabilityResolver();

  describe("formatSkillsPrompt", () => {
    it("returns empty string when skills array is empty", () => {
      assert.strictEqual(resolver.formatSkillsPrompt([]), "");
    });

    it("formats skills into prompt section with content", () => {
      const skills: Skill[] = [
        {
          id: "skill.polite_tone",
          name: "Polite Tone",
          description: "Ensures responses are polite and courteous.",
          type: "skill",
          content: "- Always greet the user warmly.\n- Say please and thank you.",
        },
      ];

      const result = resolver.formatSkillsPrompt(skills);
      assert.match(result, /## Assigned Skills & Guidelines/);
      assert.match(result, /### Skill: Polite Tone \(skill\.polite_tone\)/);
      assert.match(result, /Ensures responses are polite and courteous\./);
      assert.match(result, /Always greet the user warmly\./);
    });
  });

  describe("formatToolsPrompt", () => {
    it("returns empty string when tools array is empty", () => {
      assert.strictEqual(resolver.formatToolsPrompt([]), "");
    });

    it("formats tools with parameters, types, required flags, and enums", () => {
      const tools: Tool[] = [
        {
          id: "tool.search_places",
          name: "Search Places",
          description: "Searches for attractions and places in a destination city.",
          type: "tool",
          inputSchema: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "Destination city or region",
              },
              category: {
                type: "string",
                enum: ["attraction", "restaurant", "hotel"],
                description: "Category of places",
              },
              limit: {
                type: "number",
                description: "Maximum results",
              },
            },
            required: ["location"],
          },
          execute: async () => ({ success: true, output: {} }),
        },
      ];

      const result = resolver.formatToolsPrompt(tools);
      assert.match(result, /## Available Tools/);
      assert.match(result, /You have access to the following tools/);
      assert.match(result, /### Tool: Search Places \(`tool\.search_places`\)/);
      assert.match(result, /Searches for attractions and places in a destination city\./);
      assert.match(result, /`location` \(string, required\): Destination city or region/);
      assert.match(
        result,
        /`category` \(string, optional, enum: \[attraction, restaurant, hotel\]\): Category of places/,
      );
      assert.match(result, /`limit` \(number, optional\): Maximum results/);
    });

    it("formats tools with output schema returns documentation", () => {
      const tools: Tool[] = [
        {
          id: "tool.get_weather",
          name: "Get Weather",
          description: "Retrieves live weather forecasts.",
          type: "tool",
          inputSchema: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
          },
          outputSchema: {
            type: "object",
            properties: {
              location: { type: "string", description: "Resolved city" },
              temperature: {
                type: "object",
                properties: {
                  currentCelsius: { type: "number", description: "Current temp" },
                },
              },
            },
          },
          execute: async () => ({ success: true, output: {} }),
        },
      ];

      const result = resolver.formatToolsPrompt(tools);
      assert.match(result, /Returns:/);
      assert.match(result, /`location` \(string\): Resolved city/);
      assert.match(result, /`temperature\.currentCelsius` \(number\): Current temp/);
    });
  });

  describe("formatSubAgentsPrompt", () => {
    it("returns empty string when agents array is empty", () => {
      assert.strictEqual(resolver.formatSubAgentsPrompt([]), "");
    });

    it("formats sub-agents with task parameter guidance and default returns", () => {
      const agents: AgentCapability[] = [
        {
          id: "agent.travel-planner",
          agentId: "travel-planner",
          name: "Travel Planner",
          description: "Plans trips, compares destinations, and estimates budgets.",
          type: "agent",
        },
      ];

      const result = resolver.formatSubAgentsPrompt(agents);
      assert.match(result, /## Available Sub-Agents/);
      assert.match(result, /You have access to the following specialized sub-agents/);
      assert.match(result, /### Sub-Agent: Travel Planner \(`agent\.travel-planner`\)/);
      assert.match(result, /Plans trips, compares destinations, and estimates budgets\./);
      assert.match(result, /`task` \(string, required\): The task or question to delegate/);
      assert.match(result, /Returns:/);
      assert.match(result, /`response` \(string\)/);
    });

    it("formats sub-agents with custom output schema returns", () => {
      const agents: AgentCapability[] = [
        {
          id: "agent.custom-researcher",
          agentId: "custom-researcher",
          name: "Custom Researcher",
          description: "Researches specific data.",
          type: "agent",
          outputSchema: {
            summary: "string",
            score: "number",
          },
        },
      ];

      const result = resolver.formatSubAgentsPrompt(agents);
      assert.match(result, /Returns:/);
      assert.match(result, /`summary` \(string\)/);
      assert.match(result, /`score` \(number\)/);
    });
  });
});
