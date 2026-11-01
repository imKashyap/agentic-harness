import assert from "node:assert";
import { describe, it } from "node:test";

process.env["OPENROUTER_API_KEY"] = process.env["OPENROUTER_API_KEY"] || "test-openrouter-key";
process.env["OPENAI_API_KEY"] = process.env["OPENAI_API_KEY"] || "test-openai-key";
process.env["ANTHROPIC_API_KEY"] = process.env["ANTHROPIC_API_KEY"] || "test-anthropic-key";

import { ExecutionContext } from "../../src/core/execution/execution-context.js";
import { AgentModelConfigRegistry } from "../../src/llm/configuration/agent-config-registry.js";
import {
  CONFIG_INVALIDATION_CHANNEL,
  ConfigCache,
} from "../../src/llm/configuration/config-cache.js";
import { InferenceProfileRegistry } from "../../src/llm/configuration/inference-profile-registry.js";
import { ModelConfigResolver } from "../../src/llm/configuration/model-config-resolver.js";
import { ModelRegistry } from "../../src/llm/configuration/model-registry.js";
import { PostgresConfigStore } from "../../src/llm/configuration/postgres-config-store.js";
import { ProviderRegistry } from "../../src/llm/configuration/provider-registry.js";
import {
  AgentModelConfig,
  InferenceProfile,
  ModelDefinition,
  ProviderConfig,
} from "../../src/llm/configuration/types.js";
import {
  ConfigValidationError,
  mapInferenceParameters,
} from "../../src/llm/configuration/validation.js";
import { LLMFactory } from "../../src/llm/llm-factory.js";
import { MockMessageBus, MockRelationalDb } from "../support/mock-stores.js";

function setupRegistries() {
  const providerRegistry = new ProviderRegistry();
  const modelRegistry = new ModelRegistry();
  const profileRegistry = new InferenceProfileRegistry();
  const agentConfigRegistry = new AgentModelConfigRegistry();
  const resolver = new ModelConfigResolver(
    providerRegistry,
    modelRegistry,
    profileRegistry,
    agentConfigRegistry,
  );
  const db = new MockRelationalDb();
  const configStore = new PostgresConfigStore(db);
  const messageBus = new MockMessageBus();
  const configCache = new ConfigCache(resolver, configStore, agentConfigRegistry, messageBus);

  // Setup providers
  const openrouter: ProviderConfig = {
    id: "openrouter",
    name: "OpenRouter",
    providerType: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultGeneration: { temperature: 0.5, maxTokens: 1000 },
  };
  const openai: ProviderConfig = {
    id: "openai",
    name: "OpenAI",
    providerType: "openai",
    baseURL: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
  };
  const mockProvider: ProviderConfig = {
    id: "mock",
    name: "Mock Provider",
    providerType: "mock",
    baseURL: "",
    apiKeyEnv: "MOCK_API_KEY",
  };
  providerRegistry.register(openrouter);
  providerRegistry.register(openai);
  providerRegistry.register(mockProvider);

  // Setup models
  const claudeModel: ModelDefinition = {
    id: "openrouter/claude-sonnet",
    name: "Claude 3.5 Sonnet",
    providerId: "openrouter",
    modelId: "anthropic/claude-3-5-sonnet",
    contextLength: 200000,
    capabilities: {
      supportsTemperature: true,
      supportsTopP: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true,
      supportsStreaming: true,
      supportsTools: true,
      tokenParamName: "max_tokens",
    },
    defaultGeneration: { maxTokens: 1500 },
  };

  const gpt4Model: ModelDefinition = {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    providerId: "openai",
    modelId: "gpt-4o",
    contextLength: 128000,
    capabilities: {
      supportsTemperature: true,
      supportsTopP: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true,
      supportsStreaming: true,
      supportsTools: true,
      tokenParamName: "max_tokens",
    },
  };

  const o1ReasoningModel: ModelDefinition = {
    id: "openai/o1",
    name: "OpenAI o1 Reasoning",
    providerId: "openai",
    modelId: "o1",
    capabilities: {
      supportsTemperature: false,
      supportsTopP: false,
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false,
      supportsStreaming: false,
      supportsTools: false,
      tokenParamName: "max_completion_tokens",
    },
  };

  const mockModel: ModelDefinition = {
    id: "mock/default",
    name: "Mock Model",
    providerId: "mock",
    modelId: "mock-model",
    capabilities: {
      supportsTemperature: true,
      supportsTopP: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true,
      supportsStreaming: true,
      supportsTools: true,
      tokenParamName: "max_tokens",
    },
  };

  modelRegistry.register(claudeModel);
  modelRegistry.register(gpt4Model);
  modelRegistry.register(o1ReasoningModel);
  modelRegistry.register(mockModel);

  // Setup inference profiles
  const plannerProfile: InferenceProfile = {
    id: "planner_default",
    name: "Planner Profile",
    parameters: { temperature: 0.1, maxTokens: 2000, topP: 0.95 },
  };

  const executorProfile: InferenceProfile = {
    id: "executor_default",
    name: "Executor Profile",
    parameters: { temperature: 0.3, maxTokens: 4000, topP: 1.0 },
  };

  const summarizerProfile: InferenceProfile = {
    id: "summarizer_default",
    name: "Summarizer Profile",
    parameters: { temperature: 0.7, maxTokens: 1000, topP: 0.9 },
  };

  const reasoningProfile: InferenceProfile = {
    id: "reasoning_default",
    name: "Reasoning Profile",
    parameters: { maxTokens: 8000 },
  };

  profileRegistry.register(plannerProfile);
  profileRegistry.register(executorProfile);
  profileRegistry.register(summarizerProfile);
  profileRegistry.register(reasoningProfile);

  return {
    providerRegistry,
    modelRegistry,
    profileRegistry,
    agentConfigRegistry,
    resolver,
    db,
    configStore,
    messageBus,
    configCache,
  };
}

describe("Dynamic LLM Configuration & Inference Management", () => {
  it("1. registers and accesses multiple providers and models without duplicating connection details", () => {
    const { providerRegistry, modelRegistry } = setupRegistries();

    assert.strictEqual(providerRegistry.getAll().length, 3);
    assert.strictEqual(modelRegistry.getAll().length, 4);

    const model = modelRegistry.get("openrouter/claude-sonnet");
    assert.strictEqual(model.providerId, "openrouter");
    // Provider connection details are not duplicated in model
    assert.strictEqual((model as Record<string, unknown>).baseURL, undefined);

    const provider = providerRegistry.get(model.providerId);
    assert.strictEqual(provider.baseURL, "https://openrouter.ai/api/v1");
    assert.strictEqual(provider.apiKeyEnv, "OPENROUTER_API_KEY");
  });

  it("2. supports multiple inference profiles for the exact same model", () => {
    const { resolver } = setupRegistries();

    const plannerRes = resolver.resolveExplicit("openrouter/claude-sonnet", "planner_default");
    const executorRes = resolver.resolveExplicit("openrouter/claude-sonnet", "executor_default");
    const summarizerRes = resolver.resolveExplicit(
      "openrouter/claude-sonnet",
      "summarizer_default",
    );

    assert.strictEqual(plannerRes.providerModelId, "anthropic/claude-3-5-sonnet");
    assert.strictEqual(plannerRes.parameters.temperature, 0.1);
    assert.strictEqual(plannerRes.parameters.maxTokens, 2000);

    assert.strictEqual(executorRes.providerModelId, "anthropic/claude-3-5-sonnet");
    assert.strictEqual(executorRes.parameters.temperature, 0.3);
    assert.strictEqual(executorRes.parameters.maxTokens, 4000);

    assert.strictEqual(summarizerRes.providerModelId, "anthropic/claude-3-5-sonnet");
    assert.strictEqual(summarizerRes.parameters.temperature, 0.7);
    assert.strictEqual(summarizerRes.parameters.maxTokens, 1000);
  });

  it("3. reuses one inference profile across different models", () => {
    const { resolver } = setupRegistries();

    const claudePlanner = resolver.resolveExplicit("openrouter/claude-sonnet", "planner_default");
    const gptPlanner = resolver.resolveExplicit("openai/gpt-4o", "planner_default");

    assert.strictEqual(claudePlanner.providerId, "openrouter");
    assert.strictEqual(claudePlanner.parameters.temperature, 0.1);
    assert.strictEqual(claudePlanner.parameters.maxTokens, 2000);

    assert.strictEqual(gptPlanner.providerId, "openai");
    assert.strictEqual(gptPlanner.parameters.temperature, 0.1);
    assert.strictEqual(gptPlanner.parameters.maxTokens, 2000);
  });

  it("4. independently changes an agent's model and inference profile", () => {
    const { agentConfigRegistry, resolver } = setupRegistries();

    // Initial agent config: Claude with planner profile
    const agentConfig: AgentModelConfig = {
      agentId: "agent-alpha",
      modelId: "openrouter/claude-sonnet",
      inferenceProfileId: "planner_default",
    };
    agentConfigRegistry.register(agentConfig);

    let resolved = resolver.resolve("agent-alpha");
    assert.strictEqual(resolved.providerModelId, "anthropic/claude-3-5-sonnet");
    assert.strictEqual(resolved.parameters.temperature, 0.1);

    // Change profile only (to executor_default) without changing model
    agentConfigRegistry.register({
      ...agentConfig,
      inferenceProfileId: "executor_default",
    });
    resolved = resolver.resolve("agent-alpha");
    assert.strictEqual(resolved.providerModelId, "anthropic/claude-3-5-sonnet");
    assert.strictEqual(resolved.parameters.temperature, 0.3);
    assert.strictEqual(resolved.parameters.maxTokens, 4000);

    // Change model only (to gpt-4o) without changing profile
    agentConfigRegistry.register({
      agentId: "agent-alpha",
      modelId: "openai/gpt-4o",
      inferenceProfileId: "executor_default",
    });
    resolved = resolver.resolve("agent-alpha");
    assert.strictEqual(resolved.providerId, "openai");
    assert.strictEqual(resolved.providerModelId, "gpt-4o");
    assert.strictEqual(resolved.parameters.temperature, 0.3);
  });

  it("5. resolves complete configuration and securely looks up API key from environment", () => {
    const { resolver } = setupRegistries();

    const res = resolver.resolveExplicit(
      "mock/default",
      "planner_default",
      undefined,
      "test-agent",
    );

    assert.strictEqual(res.agentId, "test-agent");
    assert.strictEqual(res.providerType, "mock");
    assert.strictEqual(res.apiKey, "mock-key");
    assert.strictEqual(res.parameters.temperature, 0.1);
    assert.strictEqual(res.configVersion, 1);
  });

  it("6. strictly enforces merge precedence: Provider < Model < Profile < Agent < Invocation", () => {
    const { agentConfigRegistry, resolver } = setupRegistries();

    // Provider has default temperature: 0.5, maxTokens: 1000
    // Model has default maxTokens: 1500 (overrides provider default 1000)
    // Profile sets temperature: 0.1, maxTokens: 2000 (overrides model default)
    // Agent overrides temperature: 0.2
    // Invocation overrides maxTokens: 3500

    agentConfigRegistry.register({
      agentId: "precedence-agent",
      modelId: "openrouter/claude-sonnet",
      inferenceProfileId: "planner_default",
      overrides: { temperature: 0.2 },
    });

    const res = resolver.resolve("precedence-agent", { maxTokens: 3500 });

    assert.strictEqual(res.parameters.temperature, 0.2); // from agent override
    assert.strictEqual(res.parameters.maxTokens, 3500); // from invocation override
    assert.strictEqual(res.parameters.topP, 0.95); // from profile
  });

  it("7. validates model capabilities and rejects unsupported parameters early", () => {
    const { resolver } = setupRegistries();

    // openai/o1 does NOT support temperature or topP
    assert.throws(
      () =>
        resolver.resolveExplicit(
          "openai/o1",
          "planner_default", // has temperature: 0.1
        ),
      (err: unknown) => {
        return (
          err instanceof ConfigValidationError &&
          err.code === "CONFIG_VALIDATION_ERROR" &&
          err.message.includes("Model does not support 'temperature' parameter")
        );
      },
    );

    // Using valid reasoning profile without temperature succeeds
    const validRes = resolver.resolveExplicit("openai/o1", "reasoning_default");
    assert.strictEqual(validRes.providerModelId, "o1");
    assert.strictEqual(validRes.parameters.maxTokens, 8000);
  });

  it("8. maps normalized internal parameters to provider-specific field names", () => {
    const { modelRegistry } = setupRegistries();

    const claudeModel = modelRegistry.get("openrouter/claude-sonnet");
    const o1Model = modelRegistry.get("openai/o1");

    const claudePayload = mapInferenceParameters(
      { maxTokens: 2048, temperature: 0.7, topP: 0.9 },
      claudeModel.capabilities,
    );
    assert.strictEqual(claudePayload["max_tokens"], 2048);
    assert.strictEqual(claudePayload["temperature"], 0.7);
    assert.strictEqual(claudePayload["top_p"], 0.9);

    const o1Payload = mapInferenceParameters(
      { maxTokens: 4096, reasoningEffort: "high" },
      o1Model.capabilities,
    );
    // Maps maxTokens to max_completion_tokens for o1
    assert.strictEqual(o1Payload["max_completion_tokens"], 4096);
    assert.strictEqual(o1Payload["reasoning_effort"], "high");
    assert.strictEqual(o1Payload["max_tokens"], undefined);
  });

  it("9. invalidates worker in-memory cache via Redis Pub/Sub events", async () => {
    const { configCache, messageBus, agentConfigRegistry } = setupRegistries();
    await configCache.initialize();

    agentConfigRegistry.register({
      agentId: "cached-agent-1",
      modelId: "mock/default",
      inferenceProfileId: "planner_default",
    });
    agentConfigRegistry.register({
      agentId: "cached-agent-2",
      modelId: "mock/default",
      inferenceProfileId: "executor_default",
    });

    // Populate cache
    configCache.resolve("cached-agent-1");
    configCache.resolve("cached-agent-2");
    assert.strictEqual(configCache.getCacheSize(), 2);

    // Publish specific agent invalidation event
    await messageBus.publish(CONFIG_INVALIDATION_CHANNEL, {
      agentId: "cached-agent-1",
      version: 2,
      timestamp: Date.now(),
    });

    // Wait a tick for event delivery
    await new Promise((resolve) => setTimeout(resolve, 10));

    // cached-agent-1 is evicted, cached-agent-2 is preserved
    assert.strictEqual(configCache.getCacheSize(), 1);

    // Global invalidation evicts everything
    await messageBus.publish(CONFIG_INVALIDATION_CHANNEL, {
      version: 3,
      timestamp: Date.now(),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(configCache.getCacheSize(), 0);
  });

  it("10. reconciles configuration version periodically against PostgreSQL store", async () => {
    const { configCache, configStore, agentConfigRegistry } = setupRegistries();

    agentConfigRegistry.register({
      agentId: "reconcile-agent",
      modelId: "mock/default",
      inferenceProfileId: "planner_default",
    });
    configCache.resolve("reconcile-agent");
    assert.strictEqual(configCache.getCacheSize(), 1);

    // Simulate remote PostgreSQL version increment
    await configStore.incrementVersion("Remote update");

    const result = await configCache.reconcile();
    assert.strictEqual(result.reconciled, true);
    assert.strictEqual(result.latestVersion, 2);
    // Cache was invalidated
    assert.strictEqual(configCache.getCacheSize(), 0);
  });

  it("11. preserves and falls back to last known valid configuration if refresh fails", () => {
    const { configCache, agentConfigRegistry, modelRegistry } = setupRegistries();

    agentConfigRegistry.register({
      agentId: "resilient-agent",
      modelId: "mock/default",
      inferenceProfileId: "planner_default",
    });

    // Initial valid resolution
    const initial = configCache.resolve("resilient-agent");
    assert.strictEqual(initial.parameters.temperature, 0.1);

    // Clear the cache to force re-resolution
    // And simulate a corruption/failure by removing the model from registry
    modelRegistry.delete("mock/default");

    // configCache falls back to last known valid config
    const fallback = configCache.resolve("resilient-agent");
    assert.strictEqual(fallback.agentId, "resilient-agent");
    assert.strictEqual(fallback.parameters.temperature, 0.1);
  });

  it("12. pins configuration for the duration of an already-running DAG execution", () => {
    const { configCache, agentConfigRegistry } = setupRegistries();

    agentConfigRegistry.register({
      agentId: "dag-agent",
      modelId: "mock/default",
      inferenceProfileId: "planner_default",
    });

    const executionContext: ExecutionContext = {
      runId: "dag-run-001",
      agentId: "dag-agent",
    };

    // First step resolves and pins the config to executionContext
    const firstStepConfig = configCache.resolve("dag-agent", executionContext);
    assert.strictEqual(firstStepConfig.parameters.temperature, 0.1);
    assert.strictEqual(
      executionContext.metadata?.pinnedConfigVersion,
      firstStepConfig.configVersion,
    );

    // Dynamically update the agent config midway through the run
    agentConfigRegistry.register({
      agentId: "dag-agent",
      modelId: "mock/default",
      inferenceProfileId: "executor_default", // temp 0.3
    });
    configCache.clear(); // worker cache evicted

    // Second step of the DAG with the same executionContext MUST use the pinned configuration
    const secondStepConfig = configCache.resolve("dag-agent", executionContext);
    assert.strictEqual(secondStepConfig.parameters.temperature, 0.1); // Not 0.3!
  });

  it("13. pools and reuses provider clients/adapters across multiple requests", () => {
    const { resolver } = setupRegistries();

    const res1 = resolver.resolveExplicit("mock/default", "planner_default");
    const res2 = resolver.resolveExplicit("mock/default", "executor_default");

    LLMFactory.clearPool();
    assert.strictEqual(LLMFactory.getPoolSize(), 0);

    const client1 = LLMFactory.createFromResolved(res1);
    assert.strictEqual(LLMFactory.getPoolSize(), 1);

    const client2 = LLMFactory.createFromResolved(res2);
    // Same mock provider adapter is reused across distinct inference profiles
    assert.strictEqual(LLMFactory.getPoolSize(), 1);

    // ConfiguredLLM correctly scopes each client's parameters
    assert.strictEqual(client1.config.parameters.temperature, 0.1);
    assert.strictEqual(client2.config.parameters.temperature, 0.3);
  });
});
