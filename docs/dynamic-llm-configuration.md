# Dynamic LLM Provider, Model, and Inference Configuration Guide

This guide describes how to configure, extend, and manage LLM providers, models, inference profiles, and agent configurations within the Agentic Harness.

---

## 1. Architecture Overview

The configuration system cleanly decouples four key entities:

```
[Provider Registry]
      │
      ▼
[Model Registry] ──────┐
                       ├─► [ModelConfigResolver] ─► [ConfigCache] ─► [LLMFactory] ─► [Agent]
[Inference Profile] ───┤
      ▲                │
      └────────────────┘
[Agent Config Registry]
```

1. **Provider Registry**: Connection endpoints, provider types, and environment variable references for API credentials.
2. **Model Registry**: Model identity, provider association, and model capabilities (supported parameters, parameter name mappings).
3. **Inference Profile Registry**: Reusable inference parameter sets (temperature, token limits, top_p, penalties).
4. **Agent Model Config Registry**: Associates an agent with a model and an inference profile, with optional agent-level overrides.
5. **ModelConfigResolver**: Resolves full runtime configurations using strict 5-tier merge precedence and capability validation.
6. **ConfigCache**: In-memory worker cache, Redis Pub/Sub cache invalidation, periodic version reconciliation, and DAG execution pinning.
7. **LLMFactory**: Connection-pooled adapter manager ensuring HTTP clients and adapters are reused across requests.

---

## 2. API Key and Secrets Management

> [!IMPORTANT]
> API keys are **never** stored in YAML files, database tables, or logs.
> All providers specify `apiKeyEnv`, pointing to an environment variable name (e.g. `OPENROUTER_API_KEY`, `OPENAI_API_KEY`). The resolver accesses `process.env[apiKeyEnv]` at runtime.

Add your API keys to `.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 3. How to Add a New Provider

In `config/providers.yaml`:

```yaml
providers:
  - id: groq
    name: Groq Cloud
    providerType: openai-compatible
    baseURL: https://api.groq.com/openai/v1
    apiKeyEnv: GROQ_API_KEY
    timeoutMs: 30000
    maxRetries: 3
    defaultGeneration:
      temperature: 0.7
      maxTokens: 2048
```

Or programmatically:

```typescript
providerRegistry.register({
  id: "groq",
  name: "Groq Cloud",
  providerType: "openai-compatible",
  baseURL: "https://api.groq.com/openai/v1",
  apiKeyEnv: "GROQ_API_KEY",
});
```

---

## 4. How to Add a New Model

In `config/models.yaml`:

```yaml
models:
  - id: groq/llama-3.3-70b
    name: LLaMA 3.3 70B (Groq)
    providerId: groq
    modelId: llama-3.3-70b-versatile
    contextLength: 131072
    capabilities:
      supportsTemperature: true
      supportsTopP: true
      supportsStreaming: true
      supportsTools: true
      tokenParamName: max_tokens
    defaultGeneration:
      maxTokens: 4096
```

For models that require `max_completion_tokens` or do not support `temperature` (e.g. OpenAI o1/o3 reasoning models):

```yaml
models:
  - id: openai/o1
    name: OpenAI o1 Reasoning
    providerId: openai
    modelId: o1
    contextLength: 128000
    capabilities:
      supportsTemperature: false
      supportsTopP: false
      tokenParamName: max_completion_tokens
```

---

## 5. How to Add a New Inference Profile

In `config/inference_profiles.yaml`:

```yaml
profiles:
  - id: code_generation
    name: Code Generation Profile
    parameters:
      temperature: 0.2
      maxTokens: 4000
      topP: 0.95
    modelOverrides:
      openai/o1:
        maxTokens: 8000
```

---

## 6. How to Configure an Agent

In `config/agents.yaml`:

```yaml
agents:
  - agentId: planner
    modelId: openrouter/claude-3-5-sonnet
    inferenceProfileId: planner_default

  - agentId: executor
    modelId: openai/gpt-4o
    inferenceProfileId: executor_default
    overrides:
      temperature: 0.2
```

---

## 7. Configuration Override Precedence

When resolving an agent's configuration, parameters merge in the following strict order (lowest to highest precedence):

1. **Provider Defaults** (`provider.defaultGeneration`)
2. **Model Defaults** (`model.defaultGeneration`)
3. **Inference Profile** (`profile.parameters`)
4. **Profile Model/Provider Overrides** (`profile.modelOverrides`, `profile.providerOverrides`)
5. **Agent Overrides** (`agentConfig.overrides`)
6. **Explicit Invocation Overrides** (passed at execution time)

---

## 8. Dynamic Configuration & Cache Invalidation

1. **Worker In-Memory Cache**: Configurations are cached locally in worker memory for sub-millisecond lookups.
2. **Redis Invalidation**: When an agent's configuration is updated via `configCache.updateAgentConfig(config)`:
   - Config is persisted in PostgreSQL.
   - Version is incremented.
   - Event is published to Redis channel `config:invalidation`.
   - Worker pods receive the event and evict the cache.
3. **Periodic Version Reconciliation**: Worker cache periodically checks PostgreSQL's `llm_config_versions` table to reconcile versions in case of missed Redis messages.
4. **Execution Pinning**: Active DAG executions pin the configuration on `ExecutionContext.metadata.pinnedConfig`. Mid-DAG updates never alter in-flight executions.
5. **Resilience**: If refreshing fails, the worker seamlessly falls back to the last known valid configuration.
