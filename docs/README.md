# Agentic Harness Documentation

Architecture documentation for the agentic harness — focused diagrams tied to TypeScript classes and files, with explanatory text in Markdown.

## Architecture & Design Guides

See [architecture.md](./architecture.md) for the full architectural guide.

| Topic                             | Diagram / Resource                                                                   | Status      |
| :-------------------------------- | :----------------------------------------------------------------------------------- | :---------- |
| Overall Architecture              | [architecture.md](./architecture.md)                                                 | Implemented |
| Capability Loading & Discovery    | [capability-loading.mmd](./diagrams/capability-loading.mmd)                          | Implemented |
| Skill Loading & Prompt Injection  | [skill-loading.mmd](./diagrams/skill-loading.mmd)                                    | Implemented |
| Tool Invocation & Execution       | [tool-execution.mmd](./diagrams/tool-execution.mmd)                                  | Implemented |
| Agent Config, Factory & Registry  | [agent-loading.mmd](./diagrams/agent-loading.mmd)                                    | Implemented |
| Parent → Sub-Agent Delegation     | [agent-delegation.mmd](./diagrams/agent-delegation.mmd)                              | Implemented |
| End-to-End Request Lifecycle      | [request-cycle.mmd](./diagrams/request-cycle.mmd)                                    | Implemented |
| Adaptive Hybrid DAG Planning      | [architecture.md#5-adaptive-hybrid-planning--dag-execution](./architecture.md)       | Implemented |
| Short-Term & Long-Term Memory     | [architecture.md#3-short-term-memory-sessions--context-compactor](./architecture.md) | Implemented |
| Token-Level Streaming & Event Bus | [architecture.md#6-real-time-event-bus--token-streaming](./architecture.md)          | Implemented |
| HTTP & SSE Server Layer (Hono)    | [architecture.md#7-http--sse-api-server-layer-hono](./architecture.md)               | Implemented |
| Human-in-the-Loop (HITL) Gates    | [architecture.md#8-human-in-the-loop-hitl--approval-gates](./architecture.md)        | Implemented |
| Structured Logging (Pino)         | [architecture.md#9-structured-logging--observability](./architecture.md)             | Implemented |

## Viewing Diagrams

`.mmd` files are plain Mermaid source. To preview:

- Open the file in VS Code with a Mermaid preview extension
- Paste the contents into [mermaid.live](https://mermaid.live)
- Use the Mermaid CLI: `npx @mermaid-js/mermaid-cli -i docs/diagrams/<name>.mmd -o out.svg`

## Source Layout

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
│   ├── tools/                 # RememberFactTool, SearchMemoryTool
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
