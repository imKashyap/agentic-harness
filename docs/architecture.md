# Architecture

This document describes the design, folder organization, and runtime flow of the **Agentic Harness**.

---

## 1. Overall System Architecture

The harness is organized into an enterprise modular layout: **application servers (`apps/api/`)**, **core agent & orchestration runtime (`src/core/`)**, **context & token management (`src/context/`)**, **guardrails & policy engine (`src/guardrails/`)**, **observability & telemetry (`src/observability/`)**, **infrastructure adapters (`src/infrastructure/`)**, **multi-provider LLMs (`src/llm/`)**, **capabilities (`src/capabilities/`)**, **domain packs (`skills/`, `tools/`, `agents/`)**, and **test suites (`tests/`)**.

```
agentic-harness/
│
├── apps/
│   └── api/
│       ├── routes/
│       │   ├── health.ts          # GET /health with live metrics
│       │   ├── chat.ts            # GET/DELETE /v1/sessions
│       │   ├── runs.ts            # POST /v1/agents/:id/runs (Sync & SSE) + Approvals
│       │   └── memory.ts          # POST /v1/memory, POST /v1/memory/search, GET /v1/capabilities
│       └── server.ts              # Hono web app & Node.js HTTP server bootstrap
│
├── src/
│   ├── core/
│   │   ├── agent/                 # Agent, AgentRunner, AgentFactory, AgentRegistry, AgentConfig
│   │   ├── orchestration/         # DAG DependencyGraph, ExecutionEngine, Scheduler, Planner
│   │   ├── execution/             # ExecutionContext, Task, TaskStatus, ExecutionResult
│   │   ├── state/                 # ConversationState, RunState, StateStore
│   │   └── harness.ts             # Server-ready AgentHarness facade container
│   │
│   ├── context/
│   │   ├── token-manager.ts       # Token estimation & budget management
│   │   ├── context-manager.ts     # Multi-turn window sliding & compaction
│   │   ├── prompt-builder.ts      # Semantic prompt assembly with dynamic sections
│   │   └── memory.ts              # Embeddings, Cosine similarity, MemoryManager
│   │
│   ├── guardrails/
│   │   ├── input-guard.ts         # Prompt injection & security validation
│   │   ├── tool-guard.ts          # Sensitive action & permission evaluator
│   │   ├── output-guard.ts        # PII redaction & content sanitation
│   │   └── policy-engine.ts       # Non-blocking HITL policy resolution
│   │
│   ├── observability/
│   │   ├── logging.ts             # Structured Pino logger
│   │   ├── tracing.ts             # Distributed trace spans & correlation IDs
│   │   ├── metrics.ts             # Real-time latency, run counters, token accounting
│   │   └── events.ts              # Typed HarnessEventBus pub/sub & SSE streaming
│   │
│   ├── infrastructure/
│   │   ├── redis/                 # Key-value & cache store adapters
│   │   ├── postgres/              # Relational & pgvector store adapters
│   │   └── messaging/             # Pub/Sub message bus adapters
│   │
│   ├── llm/
│   │   ├── openrouter.ts          # OpenRouter streaming adapter
│   │   ├── openai.ts              # OpenAI adapter
│   │   ├── anthropic.ts           # Anthropic adapter
│   │   ├── mock-llm.ts            # Deterministic mock LLM adapter
│   │   └── model-router.ts        # Dynamic multi-provider routing & fallback
│   │
│   ├── resilience/
│   │   ├── retry.ts               # Exponential backoff with full jitter & status filters
│   │   ├── timeout.ts             # Promise race timeout with AbortSignal cancellation
│   │   ├── fallback.ts            # Fallback strategy execution
│   │   ├── circuit-breaker.ts     # 3-state machine (Closed, Open, Half-Open)
│   │   └── types.ts               # RetryPolicy, TimeoutPolicy, FallbackPolicy, CircuitBreakerOptions
│   │
│   ├── capabilities/
│   │   ├── skills/                # Skill metadata & registry
│   │   ├── tools/                 # Tool metadata & registry
│   │   └── agents/                # Agent capability descriptors & execution
│   │
│   ├── di/                        # Inversify IoC Container & Service Identifiers (TYPES)
│   └── errors/                    # Domain-specific typed error classes (HarnessError)
│
├── skills/                        # Modular skill packs (SKILL.md + metadata.json)
│   ├── ticket-booking/
│   ├── code-review/
│   └── incident-debugging/
│
├── tools/                         # Tool specifications (tool.json)
│   ├── calculator/
│   ├── github/
│   ├── slack/
│   └── jira/
│
├── agents/                        # Declarative agent configurations (agent.json)
│   ├── coder/
│   ├── reviewer/
│   └── researcher/
│
├── config/                        # Environment & model configurations
│   ├── development.yaml
│   ├── production.yaml
│   └── models.yaml
│
├── docker-compose.yaml            # Local stack (API, Redis, pgvector)
│
└── tests/
    ├── unit/                      # Guardrails, Context, Observability, DI unit tests
    ├── integration/               # Hono HTTP & SSE server integration tests
    ├── orchestration/             # DAG graph, cycle detection, parallel scheduler tests
    └── evals/                     # Agent eval benchmarks
```

---

## 2. Inversify DI Container & Singleton Scoping

All dependencies are wired through the Inversify IoC container in `src/di/container.ts` with singleton lifecycle:

- `TYPES.EventBus` $\rightarrow$ `HarnessEventBus`
- `TYPES.TracingService` $\rightarrow$ `TracingService`
- `TYPES.MetricsService` $\rightarrow$ `MetricsService`
- `TYPES.StateStore`, `TYPES.SessionStore`, `TYPES.CheckpointStore`, and `TYPES.LongTermMemoryStore` $\rightarrow$ PostgreSQL-backed stores
- `TYPES.KeyValueStore` and `TYPES.MessageBus` $\rightarrow$ Redis-backed adapters
- Harness startup initializes PostgreSQL and Redis and fails if a configured service is unavailable. Tests inject mocks for external services.
- `TYPES.ContextManager` $\rightarrow$ `ContextManager`
- `TYPES.TokenManager` $\rightarrow$ `TokenManager`
- `TYPES.InputGuard`, `TYPES.ToolGuard`, `TYPES.OutputGuard`, `TYPES.PolicyEngine`
- `TYPES.ModelRouter` $\rightarrow$ `ModelRouter`

---

## 3. Server Front-Door (`apps/api/`)

The Hono HTTP/SSE server in `apps/api/server.ts` is the single external entrypoint:

- `GET /health`: Health check with live runtime metrics
- `POST /v1/agents/:id/runs`: Run agent synchronously or stream tokens via Server-Sent Events (SSE)
- `GET /v1/sessions`, `GET /v1/sessions/:id`, `DELETE /v1/sessions/:id`: Conversation state management
- `GET /v1/approvals`, `POST /v1/runs/:id/approve`, `POST /v1/runs/:id/reject`: Human-in-the-loop gates
- `POST /v1/memory`, `POST /v1/memory/search`: Semantic long-term memory operations

---

## 4. Resilience & Fault Tolerance (`src/resilience/`)

The harness includes enterprise-grade resilience patterns across all execution layers:

### 1. Retries with Exponential Backoff & Jitter (`withRetry`)

- **Exponential Backoff**: `delay = initialDelayMs * (multiplier ^ attempt)`
- **Full Jitter**: Random delay between `0` and `cappedDelay` to prevent thundering herds against upstream APIs.
- **Smart Filtering**: Automatically retries 429 (Rate Limit), 500, 502, 503, 504, connection resets, and timeouts, while avoiding non-retryable 4xx client errors.

### 2. Timeouts with AbortSignal (`withTimeout`)

- **Per-LLM Timeout**: 60s default timeout with abort controller propagation to fetch requests.
- **Per-Tool Timeout**: 30s default timeout (customizable per tool definition).
- **Per-Agent Run Timeout**: 300s overall budget per agent run.

### 3. Circuit Breaker (`CircuitBreaker`)

- **3-State Machine**: `CLOSED` $\rightarrow$ `OPEN` $\rightarrow$ `HALF_OPEN` $\rightarrow$ `CLOSED`.
- **Fast Failure**: Prevents cascading delays when an upstream provider or LLM service is experiencing downtime.

### 4. Multi-Provider Fallbacks (`ModelRouter` & `withFallback`)

- Seamless automatic failover: if primary provider encounters exhaustion or circuit trip, calls are transparently redirected to the designated secondary provider (e.g. OpenRouter $\rightarrow$ OpenAI $\rightarrow$ Anthropic).
