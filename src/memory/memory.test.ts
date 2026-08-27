import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { AgentConfig } from "../core/agent/agent-config.js";
import { AgentHarness } from "../core/harness.js";
import { StaticPlanGenerator } from "../core/orchestration/static-plan-generator.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { cosineSimilarity } from "./long-term/cosine-similarity.js";
import { LocalHashEmbeddingProvider } from "./long-term/embeddings.js";
import { InMemoryLongTermStore } from "./long-term/in-memory-long-term-store.js";
import { MemoryManager } from "./long-term/memory-manager.js";
import { RememberFactTool, SearchMemoryTool } from "./tools/memory-tools.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: "v1",
      content: "You are a test memory agent.",
    };
  },
};

describe("Cosine Similarity & Local Embeddings", () => {
  it("calculates exact similarity for identical vectors and zero for orthogonal", () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];

    assert.strictEqual(cosineSimilarity(vecA, vecB), 1);
    assert.strictEqual(cosineSimilarity(vecA, vecC), 0);
  });

  it("generates normalized embedding vectors using LocalHashEmbeddingProvider", async () => {
    const provider = new LocalHashEmbeddingProvider(32);
    const vec1 = await provider.embed("TypeScript React development");
    const vec2 = await provider.embed("TypeScript React development");
    const vec3 = await provider.embed("Cooking recipes and baking pizza");

    assert.strictEqual(vec1.length, 32);
    // Identical text should have identical vectors
    assert.strictEqual(cosineSimilarity(vec1, vec2), 1);

    // Unrelated text should have lower similarity
    const simRelated = cosineSimilarity(vec1, vec2);
    const simUnrelated = cosineSimilarity(vec1, vec3);
    assert.ok(simRelated > simUnrelated);
  });
});

describe("InMemoryLongTermStore & MemoryManager", () => {
  it("saves facts and retrieves the most relevant memories by semantic query", async () => {
    const manager = new MemoryManager(new InMemoryLongTermStore());

    await manager.remember("User preferred database is PostgreSQL 16 on AWS Aurora", {
      agentId: "db-agent",
      tags: ["infra", "database"],
    });

    await manager.remember("User prefers tabs over spaces in code formatting", {
      agentId: "db-agent",
      tags: ["style"],
    });

    await manager.remember("The project uses Docker for local container development", {
      agentId: "dev-agent",
      tags: ["infra"],
    });

    const results = await manager.recall("PostgreSQL database setup", {
      agentId: "db-agent",
    });

    assert.ok(results.length > 0);
    assert.match(results[0]?.entry.content ?? "", /PostgreSQL/);

    const promptSection = manager.formatMemoryPrompt(results);
    assert.match(promptSection, /## Relevant Long-Term Memory & Prior Context/);
    assert.match(promptSection, /PostgreSQL 16/);
  });
});

describe("Memory Tools (RememberFactTool & SearchMemoryTool)", () => {
  const manager = new MemoryManager(new InMemoryLongTermStore());
  const rememberTool = new RememberFactTool(manager);
  const searchTool = new SearchMemoryTool(manager);
  const context = { runId: "test-run", agentId: "test-agent" };

  it("stores a fact into memory via RememberFactTool", async () => {
    const result = await rememberTool.execute(
      { fact: "Authentication uses JWT with RSA256", tags: ["security"] },
      context,
    );

    assert.strictEqual(result.success, true);
    assert.match(JSON.stringify(result.output), /Fact saved to long-term memory/);
  });

  it("searches memory via SearchMemoryTool", async () => {
    const result = await searchTool.execute({ query: "Authentication JWT security" }, context);

    assert.strictEqual(result.success, true);
    assert.match(JSON.stringify(result.output), /RSA256/);
  });

  it("rejects invalid inputs gracefully", async () => {
    const res1 = await rememberTool.execute({}, context);
    assert.strictEqual(res1.success, false);

    const res2 = await searchTool.execute({ query: "" }, context);
    assert.strictEqual(res2.success, false);
  });
});

describe("AgentHarness with Memory Subsystems", () => {
  it("allows storing and recalling memories directly through harness facade", async () => {
    const harness = await AgentHarness.init({
      tools: [],
      planGenerator: new StaticPlanGenerator(),
      promptProvider: mockPromptProvider,
    });

    const config: AgentConfig = {
      id: "memory-agent",
      name: "Memory Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "mem-prompt" },
      skills: [],
      tools: ["tool.remember_fact", "tool.search_memory"],
      subAgents: [],
    };

    harness.registerAgent(config);

    // Save memory via facade
    const memory = await harness.remember("Production region is us-east-1", {
      agentId: "memory-agent",
      tags: ["aws", "cloud"],
    });

    assert.ok(memory.id);

    // Recall via facade
    const recalled = await harness.recall("Where is the production region located?", {
      agentId: "memory-agent",
    });

    assert.ok(recalled.length > 0);
    assert.match(recalled[0]?.entry.content ?? "", /us-east-1/);

    // Verify capability registry has memory tools available
    assert.strictEqual(harness.capabilityRegistry.has("tool.remember_fact"), true);
    assert.strictEqual(harness.capabilityRegistry.has("tool.search_memory"), true);
  });
});
