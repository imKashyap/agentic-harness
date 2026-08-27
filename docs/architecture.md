# Architecture

This document describes the design, folder organization, and runtime flow of the **Agentic Harness**.

---

## 1. Overall System Architecture

The harness is organized into decoupled layers: **facade/bootstrap**, **core orchestration & agent runtime**, **memory subsystem**, **capabilities (tools, skills, sub-agents)**, **event streaming**, **HTTP/SSE server**, **human-in-the-loop gates**, and **LLM adapters**.

```
src/
├── core/
│   ├── agent/                 # Agent, AgentRunner, AgentFactory, AgentRegistry, AgentConfig
│   ├── execution/             # ExecutionContext (Runtime state & identifiers)
│   ├── orchestration/         # DAG DependencyGraph, ExecutionEngine, Scheduler, Planner, PlanValidator
│   ├── harness.ts             # Server-ready AgentHarness facade container
│   └── index.ts               # Core barrel exports
├── events/
│   ├── event-bus.ts           # Typed pub/sub event bus & async iterable stream runners
│   ├── types.ts               # HarnessEventMap, HarnessEventType, payloads
│   └── index.ts               # Events barrel exports
├── server/
│   ├── app.ts                 # Hono web app with CORS, logging, and error handling
│   ├── server.ts              # Node.js HTTP server adapter
│   ├── start.ts               # Standalone server startup entrypoint
│   ├── routes/                # REST & SSE endpoints (agents, sessions, capabilities, runs)
│   └── index.ts               # Server barrel exports
├── hitl/
│   ├── approval-manager.ts    # Deferred approval resolution & timeout manager
│   ├── checkpoint-store.ts    # InMemory & FileCheckpointStore
│   ├── types.ts               # Checkpoint, ApprovalDecision, ApprovalStatus
│   └── index.ts               # HITL barrel exports
├── memory/
│   ├── session/               # Short-Term SessionStore (InMemory, FileStore) & ContextCompactor
│   ├── long-term/             # LongTermMemoryStore, Vector Embeddings & Cosine Similarity, MemoryManager
│   ├── tools/                 # RememberFactTool (tool.remember_fact), SearchMemoryTool (tool.search_memory)
│   ├── types.ts               # Session, MemoryEntry, MemorySearchResult, SessionRunOptions
│   └── index.ts               # Memory barrel exports
├── capabilities/
│   ├── registry/              # CapabilityRegistry, CapabilityManager
│   ├── loaders/               # SkillLoader, AgentCapabilityLoader, ToolLoader
│   ├── tools/                 # Tool interface, ToolExecutor, ToolCapabilityExecutor, CalculatorTool
│   ├── agents/                # AgentCapability, SubAgentExecutor
│   ├── skills/                # Skill interface & loaders
│   ├── resolution/            # CapabilityResolver (Agent scoping & prompt injection)
│   ├── dispatch/              # CapabilityDispatcher, CapabilityExecutor interface
│   ├── capability-utils.ts    # ID parsing and normalization
│   └── index.ts               # Capabilities barrel exports
├── errors/                    # Domain-specific typed error classes (HarnessError hierarchy)
├── llm/
│   ├── types.ts               # LLM, Message, ToolCall, LLMRequest, LLMResponse, streaming chunks
│   ├── llm-factory.ts         # Provider adapter factory
│   ├── adapters/              # OpenRouterLLM (SSE stream parser), MockLLM
│   └── index.ts               # LLM barrel exports
├── prompts/                   # PromptProvider, FilePromptProvider
├── utils/                     # Structured Pino Logger & pino-pretty
└── index.ts                   # CLI / application entry point
```

---

## 2. Server-Ready `AgentHarness` Facade

The `AgentHarness` container class (`src/core/harness.ts`) encapsulates bootstrap, discovery, memory stores, event streaming, HITL approval gates, and runtime execution. It is designed to be embedded cleanly into CLI tools, background workers, or HTTP/REST/SSE microservices:

```typescript
import { AgentHarness } from "./core/harness.js";

// Initialize harness (with SessionStore, MemoryManager, EventBus & HITL out-of-the-box)
const harness = await AgentHarness.init({
  agentsDir: "./agents",
  skillsDir: "./skills",
  promptsDir: "./prompts/agents",
});

// Multi-Turn Execution: pass sessionId to maintain conversational memory
const result = await harness.runAgent(
  "default-agent",
  "My name is Alice and I work with TypeScript",
  {
    sessionId: "user-session-1",
  },
);

// Real-Time Token & Event Streaming
for await (const event of harness.runAgentStream("default-agent", "Explain event streaming")) {
  if (event.type === "token:delta") {
    process.stdout.write(event.payload.delta);
  }
}
```

---

## 3. Short-Term Memory (Sessions & Context Compactor)

- **`SessionStore` (`src/memory/session/`)**:
  - `InMemorySessionStore`: Fast in-memory map for testing, microservices, and ephemeral sessions.
  - `FileSessionStore`: Persistent JSON storage on disk (`./sessions/{id}.json`).
- **`ContextCompactor` (`src/memory/session/context-compactor.ts`)**:
  - Prunes conversation history when exceeding message/token limits.
  - **Tool-Pair Integrity**: Enforces that `assistant (toolCalls)` and `tool (result)` messages are never split across compaction boundaries, preventing upstream LLM 400 Bad Request errors.

---

## 4. Long-Term Semantic Vector Memory

- **`EmbeddingProvider` (`src/memory/long-term/embeddings.ts`)**:
  - `LocalHashEmbeddingProvider`: Zero-dependency, deterministic 64-D hashing vectors for fast local tests and offline mode.
  - `OpenRouterEmbeddingProvider`: Production vector embeddings calling standard text-embedding models.
- **`InMemoryLongTermStore` (`src/memory/long-term/in-memory-long-term-store.ts`)**:
  - Cosine similarity vector search coupled with keyword lexical boosting.
- **`MemoryManager` (`src/memory/long-term/memory-manager.ts`)**:
  - Performs semantic recall before each agent turn and injects top matching facts into the system prompt under `## Relevant Long-Term Memory & Prior Context`.
- **Memory Tools (`src/memory/tools/memory-tools.ts`)**:
  - `tool.remember_fact`: Allows agents to explicitly store user preferences and facts.
  - `tool.search_memory`: Allows agents to query long-term memory mid-turn.

---

## 5. Adaptive Hybrid Planning & DAG Execution

- **Fast Path ($\le 1$ tool call)**: `AdaptivePlanGenerator` routes single calls directly to `StaticPlanGenerator`, taking **0 extra LLM calls** (0ms planning latency).
- **Dynamic Path ($> 1$ tool calls)**: `AdaptivePlanGenerator` routes multi-tool batches to `LLMPlanGenerator` with capability metadata to resolve data dependencies into a topological DAG.
- **Resilience Fallback**: If the Planner LLM encounters errors or malformed JSON, it automatically falls back to static parallel execution to ensure execution continuity.
- **DAG Execution**: `ExecutionEngine` + `Scheduler` execute independent tasks concurrently via `Promise.all()`.

---

## 6. Real-Time Event Bus & Token Streaming

- **`HarnessEventBus` (`src/events/event-bus.ts`)**:
  - Centralized, strongly-typed pub/sub event emitter.
  - Emits fine-grained lifecycle events: `run:start`, `run:end`, `token:delta`, `thought:delta`, `tool:call`, `task:start`, `task:complete`, `subagent:delegated`, `hitl:approval_required`, `memory:recalled`.
- **Streaming Adapters (`src/llm/adapters/openrouter/`)**:
  - Full SSE chunk parser yielding live token deltas, reasoning content (`thought:delta`), and tool call arguments.

---

## 7. HTTP & SSE API Server Layer (Hono)

- Built with **Hono** and `@hono/node-server` for low-overhead, standards-compliant routing.
- **Endpoints**:
  - `GET /health`: Liveness and uptime check.
  - `GET /v1/agents`: List all registered agents.
  - `POST /v1/agents/:id/runs`: Run agent synchronously (`JSON`) or stream live events via SSE (`Accept: text/event-stream` / `stream: true`).
  - `GET /v1/sessions` & `GET /v1/sessions/:id`: Manage conversational session histories.
  - `POST /v1/memory` & `POST /v1/memory/search`: Semantic memory ingestion and search.
  - `GET /v1/approvals`: Inspect pending Human-in-the-Loop checkpoints.
  - `POST /v1/runs/:id/approve` & `POST /v1/runs/:id/reject`: Approve or reject gated tool executions.

---

## 8. Human-in-the-Loop (HITL) & Approval Gates

- **`Tool.requiresApproval`**: Sensitive tools declare approval policies (`boolean` or dynamic predicate `(input, context) => boolean`).
- **`ApprovalManager` (`src/hitl/approval-manager.ts`)**:
  - Intercepts sensitive task execution inside `ExecutionEngine`.
  - Emits `hitl:approval_required` and creates a pending `Checkpoint`.
  - Non-blocking deferred Promise resolution: `harness.approveRun(runId)` resumes task immediately; `harness.rejectRun(runId)` aborts task cleanly.

---

## 9. Structured Logging & Observability

- Integrated **Pino** (`src/utils/logger.ts`) with child loggers for contextual tracing.
- Outputs human-readable colorized logs in development via `pino-pretty` and high-throughput JSON in production.
- Controlled via `LOG_LEVEL` environment variable (`debug`, `info`, `warn`, `error`, `silent`).
