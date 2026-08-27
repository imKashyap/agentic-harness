# 🚀 Agentic Harness

An enterprise-grade, extensible, and production-ready **TypeScript Agentic Harness** for building, orchestrating, and serving autonomous AI agents with short & long-term memory, directed acyclic graph (DAG) task execution, token streaming, human-in-the-loop approval gates, and a native HTTP / SSE API server.

---

## 📑 Table of Contents

- [Overview & Key Features](#-overview--key-features)
- [System Architecture](#-system-architecture)
- [Prerequisites](#-prerequisites)
- [Quick Start & Setup](#-quick-start--setup)
- [Running Modes](#-running-modes)
  - [HTTP & SSE API Server](#http--sse-api-server)
- [TypeScript SDK Usage](#-typescript-sdk-usage)
  - [Multi-Turn Sessions](#multi-turn-sessions)
  - [Token-Level Streaming](#token-level-streaming)
  - [Semantic Long-Term Memory](#semantic-long-term-memory)
  - [Human-in-the-Loop (HITL) Approvals](#human-in-the-loop-hitl-approvals)
- [HTTP API Reference](#-http-api-reference)
- [Creating Agents, Skills & Tools](#-creating-agents-skills--tools)
- [Development & Verification](#-development--verification)
- [VS Code Debugging](#-vs-code-debugging)
- [Documentation & Deep Dives](#-documentation--deep-dives)

---

## 🌟 Overview & Key Features

Agentic Harness provides the infrastructure required to move from prototype LLM wrappers to robust, stateful agentic systems:

- 🧠 **Dual-Tier Memory Subsystem**:
  - **Short-Term Sessions**: Multi-turn history management with `ContextCompactor` that preserves system prompts and atomic tool call/result pairs.
  - **Long-Term Vector Store**: Cosine similarity semantic search with lexical boosting and auto-injection of recalled context into prompts.
- ⚡ **Adaptive Hybrid DAG Planner**:
  - **Fast-Path (0ms overhead)**: Executes single/zero tool calls directly without extra planner LLM calls.
  - **Dynamic DAG Path**: Uses capability-aware LLM planning to construct topological dependency graphs for multi-tool batches, running independent tasks in parallel (`Promise.all`).
- 🌊 **Real-Time Token Streaming & Event Bus**:
  - Strongly typed `HarnessEventBus` emitting granular lifecycle events (`run:start`, `token:delta`, `thought:delta`, `tool:call`, `task:start`, `subagent:delegated`, etc.).
  - OpenRouter SSE streaming adapter with live markdown chunking.
- 🛡️ **Human-in-the-Loop (HITL) Approval Gates**:
  - Sensitive tools trigger execution pauses with unique approval tokens.
  - Non-blocking deferred Promise resolution with disk-backed checkpointing (`InMemoryCheckpointStore` & `FileCheckpointStore`).
- 🌐 **Hono HTTP & Server-Sent Events (SSE) Server**:
  - Fast, standards-compliant API server exposing endpoints for agent execution, streaming runs, session CRUD, and HITL decision approvals.
- 💉 **InversifyJS Dependency Injection & Singleton Scoping**:
  - Full IoC container architecture with `@injectable()`, `@inject()`, and singleton lifecycle scoping across all services and registries.
- 🔍 **Structured Logging with Pino**:
  - High-throughput structured logging with colorized, human-readable output in development (`pino-pretty`) and raw JSON in production.

---

## 🏛️ System Architecture

```
Agentic Harness
 ├── AgentHarness (Facade Container)
 │    ├── CapabilityRegistry (Tools, Skills, Sub-Agents)
 │    ├── AgentRegistry & AgentFactory
 │    ├── Orchestrator (Adaptive Planner + DAG Execution Engine)
 │    ├── SessionStore (InMemory / FileStorage) & ContextCompactor
 │    ├── MemoryManager (Embeddings + Vector Cosine Store)
 │    ├── ApprovalManager (HITL Checkpoints & Resolution)
 │    └── HarnessEventBus (Pub/Sub Lifecycle & Stream Runners)
 └── Hono HTTP & SSE Server (/v1/agents, /v1/sessions, /v1/runs, /v1/memory)
```

For full architectural diagrams and flowcharts, see [docs/architecture.md](./docs/architecture.md) and API specs at [docs/api-spec.md](./docs/api-spec.md).

---

## 📋 Prerequisites

- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **OpenRouter API Key** (optional for mock tests, required for live LLM execution): [openrouter.ai](https://openrouter.ai)

---

## 🚀 Quick Start & Setup

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/imKashyap/agentic-harness.git
cd agentic-harness
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` (or create a `.env` file):

```bash
cp .env.example .env
```

Set your configuration in `.env`:

```env
# OpenRouter API Key for live models (e.g. google/gemini-2.0-flash-001)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Logging Level (debug, info, warn, error, silent)
LOG_LEVEL=info
LOG_FORMAT=pretty
```

---

## 🚀 Running the Server

Agentic Harness exposes a single entry point: the **Hono HTTP & SSE server**. The server is the **only medium** used to communicate with the harness — there is no direct/CLI invocation of agents.

```bash
# Development (runs with tsx on the configured PORT, default 3000)
npm run dev

# Production (compile, then run the compiled output)
npm run build
npm start
```

Verify it's up:

```bash
curl http://localhost:3000/health
```

Then run agents, stream responses, manage sessions, and resolve HITL approvals entirely over HTTP — see the [HTTP API Reference](#-http-api-reference) and [`docs/api-spec.md`](./docs/api-spec.md).

---

## 💻 Interoperating via the HTTP API

The Hono server is the **only medium** for communicating with the harness. All client interactions — running agents, streaming, sessions, memory, and approvals — are performed over HTTP/HTTPS. See [`docs/api-spec.md`](./docs/api-spec.md) for the full payload schemas and SSE event catalog.

### Multi-Turn Sessions

Maintain short-term context across conversation turns by reusing the same `sessionId`:

```bash
# Turn 1: introduce user information
curl -X POST http://localhost:3000/v1/agents/default-agent/runs \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-alice-101",
    "message": "Hello! My name is Alice and I build distributed systems."
  }'

# Turn 2: the agent remembers the previous turn (same sessionId)
curl -X POST http://localhost:3000/v1/agents/default-agent/runs \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-alice-101",
    "message": "What is my name and what do I build?"
  }'
# Response: "Your name is Alice and you build distributed systems."
```

Inspect or delete a session's full message history:

```bash
curl http://localhost:3000/v1/sessions/session-alice-101
curl -X DELETE http://localhost:3000/v1/sessions/session-alice-101
```

### Token-Level Streaming

Stream tokens and orchestration events in real time over Server-Sent Events (SSE):

```bash
curl -N -X POST http://localhost:3000/v1/agents/default-agent/runs \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "Write an essay about distributed databases",
    "stream": true
  }'
```

Each SSE event is emitted as `event: <type>` followed by a `data:` JSON blob — e.g. `run:start`, `token:delta`, `task:start`, `run:end`.

### Semantic Long-Term Memory

Store and recall facts semantically over HTTP:

```bash
# Ingest a fact into the vector store
curl -X POST http://localhost:3000/v1/memory \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "default-agent",
    "tags": ["infrastructure", "db"],
    "fact": "Production database was upgraded to PostgreSQL 16.2"
  }'

# Semantic recall
curl -X POST http://localhost:3000/v1/memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "default-agent",
    "limit": 3,
    "query": "What database version are we running?"
  }'
```

### Human-in-the-Loop (HITL) Approvals

Sensitive tools (declared with `requiresApproval`) pause execution and create a pending checkpoint. Inspect and resolve them over HTTP:

```bash
# List pending approval checkpoints
curl http://localhost:3000/v1/approvals

# Approve a suspended run/checkpoint (resumes execution)
curl -X POST http://localhost:3000/v1/runs/<run-id-or-checkpoint>/approve \
  -H "Content-Type: application/json" \
  -d '{"reason": "Approved by Tech Lead"}'

# Reject a suspended run/checkpoint (aborts execution)
curl -X POST http://localhost:3000/v1/runs/<run-id-or-checkpoint>/reject \
  -H "Content-Type: application/json" \
  -d '{"reason": "Release aborted: load test regressions detected"}'
```

---

## 🌐 HTTP API Reference

> For complete payload schemas, SSE event details, and client integration snippets, see [docs/api-spec.md](./docs/api-spec.md).

| Method   | Endpoint               | Description                                                |
| :------- | :--------------------- | :--------------------------------------------------------- |
| `GET`    | `/health`              | Server health and uptime                                   |
| `GET`    | `/v1/agents`           | List registered agents                                     |
| `POST`   | `/v1/agents/:id/runs`  | Execute agent (`JSON` or SSE streaming via `stream: true`) |
| `GET`    | `/v1/sessions`         | List conversational sessions                               |
| `GET`    | `/v1/sessions/:id`     | Get session message history                                |
| `DELETE` | `/v1/sessions/:id`     | Delete a session                                           |
| `GET`    | `/v1/capabilities`     | List all registered tools, skills, and agents              |
| `POST`   | `/v1/memory`           | Ingest a memory into vector store                          |
| `POST`   | `/v1/memory/search`    | Search semantic long-term memory                           |
| `GET`    | `/v1/approvals`        | List pending HITL approval checkpoints                     |
| `POST`   | `/v1/runs/:id/approve` | Approve a suspended task run                               |
| `POST`   | `/v1/runs/:id/reject`  | Reject a suspended task run                                |

### SSE Streaming Example via `curl`:

```bash
curl -X POST http://localhost:3000/v1/agents/default-agent/runs \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "Calculate 150 * 35 and explain the steps",
    "stream": true
  }'
```

---

## 🛠️ Creating Agents, Skills & Tools

### Creating a Tool (`src/capabilities/tools/`)

```typescript
import { Tool, ToolContext, ToolResult } from "./tool.js";

export class WeatherTool implements Tool {
  public readonly id = "tool.weather";
  public readonly name = "Weather Lookup";
  public readonly description = "Fetches current weather for a city";
  public readonly type = "tool" as const;
  public readonly inputSchema = {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  };

  async execute(input: { city: string }, context: ToolContext): Promise<ToolResult> {
    return {
      success: true,
      output: { city: input.city, temp: "22°C", condition: "Sunny" },
    };
  }
}
```

### Creating an Agent (`agents/<id>/agent.json`)

```json
{
  "id": "researcher",
  "name": "Research Agent",
  "model": {
    "provider": "openrouter",
    "model": "google/gemini-2.0-flash-001"
  },
  "prompt": {
    "id": "researcher"
  },
  "skills": ["skill.greeting"],
  "tools": ["tool.calculator", "tool.search_memory"],
  "subAgents": []
}
```

---

## 🧪 Development & Verification

Run the full quality and test suite:

```bash
# Run typecheck, unit/integration tests, linter, and format checker
npm run verify

# Run unit tests only
npm test

# Auto-fix linting and formatting issues
npm run fix

# Build production TypeScript output to dist/
npm run build
```

---

## 🐞 VS Code Debugging

### 1. Launch Configurations (`.vscode/launch.json`)

- **`Debug: API Server`**: Start the Hono server (`apps/api/server.ts`) with full source mapping and breakpoints enabled.
- **`Debug: Current Test File`**: Debug the active test file directly in VS Code.
- **`Debug: Integration Tests (API)`**: Run and debug the API server integration suite (`tests/integration/api.test.ts`).
- **`Debug: Guardrails & Context Tests`**: Debug input/output guardrails, policy engine, token managers, and memory suites.
- **`Debug: Orchestration Tests`**: Debug DAG dependency graphs, cycle detection, and parallel execution.
- **`Debug: All Test Suites`**: Run all test suites under the debugger.

### 2. 1-Click Scenario Execution (`requests.http` & `.vscode/tasks.json`)

When debugging the running server:

1. Start the debugger with **`Debug: API Server`** (`F5`).
2. Place breakpoints in route handlers (`apps/api/routes/`), agent runner (`src/core/agent/`), orchestrator (`src/core/orchestration/`), or memory (`src/context/`).
3. Send requests via:
   - **`requests.http`**: Click **"Send Request"** directly above any scenario in VS Code.
   - **VS Code Tasks**: Run `Cmd+Shift+P` / `Ctrl+Shift+P` $\rightarrow$ `Tasks: Run Task` $\rightarrow$ `Scenario: Tool Calling`, `Scenario: Agent Delegation`, `Scenario: Search Memory`, or `Scenario: Streaming Tokens`.

---

## 📚 Documentation & Deep Dives

- [docs/architecture.md](./docs/architecture.md): Full architectural overview, design patterns, and runtime flow.
- [docs/api-spec.md](./docs/api-spec.md): Complete OpenAPI-style REST and SSE API specification with code snippets.
- [docs/diagrams/](./docs/diagrams/): Sequence diagrams for capability loading, tool dispatch, and agent delegation.

---

## 📄 License

MIT License. Designed with extensibility, type safety, and resilience.
