# Architecture

This document describes the design, folder organization, and runtime flow of the agentic harness.

---

## 1. Overall System Architecture

The harness is organized into decoupled layers: **facade/bootstrap**, **core orchestration & agent runtime**, **memory subsystem**, **capabilities (tools, skills, sub-agents)**, and **LLM adapters**.

```
src/
├── core/
│   ├── agent/                 # Agent, AgentRunner, AgentFactory, AgentRegistry, AgentConfig
│   ├── execution/             # ExecutionContext (Runtime state & identifiers)
│   ├── orchestration/         # DAG DependencyGraph, ExecutionEngine, Scheduler, Planner, PlanValidator
│   ├── harness.ts             # Server-ready AgentHarness facade container
│   └── index.ts               # Core barrel exports
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
│   ├── types.ts               # LLM, Message, ToolCall, LLMRequest, LLMResponse, definitions
│   ├── llm-factory.ts         # Provider adapter factory
│   ├── adapters/              # OpenRouterLLM, MockLLM
│   └── index.ts               # LLM barrel exports
├── prompts/                   # PromptProvider, FilePromptProvider
├── utils/                     # Structured Logger
└── index.ts                   # CLI / application entry point
```

---

## 2. Server-Ready `AgentHarness` Facade with Memory

The `AgentHarness` container class (`src/core/harness.ts`) encapsulates bootstrap, discovery, memory stores, and runtime execution. It is designed to be embedded cleanly into standalone scripts, CLI commands, or future HTTP/REST/gRPC API servers:

```typescript
import { AgentHarness } from "./core/harness.js";

// Initialize harness (with SessionStore & LongTermMemoryStore out-of-the-box)
const harness = await AgentHarness.init({
  agentsDir: "./agents",
  skillsDir: "./skills",
  promptsDir: "./prompts/agents",
});

// Multi-Turn Execution: pass sessionId to maintain conversational memory
const turn1 = await harness.runAgent(
  "default-agent",
  "My name is Alice and I work with TypeScript",
  {
    sessionId: "user-session-1",
  },
);

const turn2 = await harness.runAgent("default-agent", "What language do I work with?", {
  sessionId: "user-session-1",
});

// Long-Term Memory Facade APIs
await harness.remember("Production DB is PostgreSQL 16", { agentId: "default-agent" });
const memories = await harness.recall("What database is in production?", {
  agentId: "default-agent",
});
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
