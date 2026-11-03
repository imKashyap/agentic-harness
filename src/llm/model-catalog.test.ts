import assert from "node:assert";
import { describe, it } from "node:test";

import { AgentConfigSchema } from "../core/agent/agent-config.js";
import { HarnessError } from "../errors/harness-error.js";
import { OpenRouterLLM } from "./adapters/openrouter/openrouter-llm.js";
import { AnthropicLLM } from "./anthropic.js";
import { LLMFactory } from "./llm-factory.js";
import { ModelCatalog } from "./model-catalog.js";
import { OpenAILLM } from "./openai.js";

describe("ModelCatalog", () => {
  it("resolves model details from the provider and model id", () => {
    const catalog = new ModelCatalog();

    assert.deepStrictEqual(catalog.resolve({ provider: "openrouter", model: "gemma-4-31b-it" }), {
      provider: "openrouter",
      model: "gemma-4-31b-it",
      baseURL: "https://openrouter.ai/api/v1",
      contextLength: undefined,
      generation: {
        temperature: 0.7,
        maxTokens: 1024,
      },
    });
  });

  it("supports each configured provider", () => {
    const catalog = new ModelCatalog();

    assert.ok(
      LLMFactory.create(
        catalog.resolve({ provider: "openrouter", model: "google/gemini-2.0-flash-001" }),
      ) instanceof OpenRouterLLM,
    );
    assert.ok(
      LLMFactory.create(catalog.resolve({ provider: "openai", model: "gpt-4o" })) instanceof
        OpenAILLM,
    );
    assert.ok(
      LLMFactory.create(
        catalog.resolve({ provider: "anthropic", model: "claude-3-5-sonnet-20241022" }),
      ) instanceof AnthropicLLM,
    );
  });

  it("rejects model references missing from the catalog", () => {
    const catalog = new ModelCatalog();

    assert.throws(
      () => catalog.resolve({ provider: "openrouter", model: "unknown-model" }),
      (error: unknown) =>
        error instanceof HarnessError &&
        error.code === "MODEL_NOT_FOUND" &&
        error.message.includes("unknown-model"),
    );
  });

  it("keeps agent model settings limited to provider and model", () => {
    assert.throws(() =>
      AgentConfigSchema.parse({
        id: "agent",
        name: "Agent",
        model: {
          provider: "openrouter",
          model: "gemma-4-31b-it",
          generation: { temperature: 0.7 },
        },
        prompt: { id: "agent" },
        skills: [],
        tools: [],
        subAgents: [],
      }),
    );
  });
});
