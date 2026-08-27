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
│   │   ├── state/                 # ConversationState, RunState, StateStore (InMemory, File)
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
- `TYPES.StateStore` $\rightarrow$ `InMemoryStateStore` / `FileStateStore`
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
