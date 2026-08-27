# 🚀 Agentic Harness

An enterprise-grade, extensible, and production-ready **TypeScript Agentic Harness** for building, orchestrating, and serving autonomous AI agents with short & long-term memory, directed acyclic graph (DAG) task execution, token streaming, human-in-the-loop approval gates, and a native HTTP / SSE API server.

---

## 📑 Table of Contents

- [Overview & Key Features](#-overview--key-features)
- [System Architecture](#-system-architecture)
- [Prerequisites](#-prerequisites)
- [Quick Start & Setup](#-quick-start--setup)
- [Running Modes](#-running-modes)
  - [1. CLI Mode](#1-cli-mode)
  - [2. HTTP & SSE API Server](#2-http--sse-api-server)
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

For full architectural diagrams and flowcharts, see [docs/architecture.md](./docs/architecture.md) and [docs/README.md](./docs/README.md).

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

## 🕹️ Running Modes

### 1. CLI Mode

Run the default agent in interactive CLI mode:

```bash
# Run default prompt
npm run dev

# Or pass a custom query via AGENT_INPUT
AGENT_INPUT="Calculate (150 * 24) + 400 and remember that I prefer TypeScript." npm run dev
```

### 2. HTTP & SSE API Server

Start the standalone Hono HTTP & SSE server on port `3000`:

```bash
npm run start:server
```

Test the health check endpoint:

```bash
curl http://localhost:3000/health
```

---

## 💻 TypeScript SDK Usage

### Multi-Turn Sessions

Maintain short-term context across conversation turns:

```typescript
import { AgentHarness } from "./core/harness.js";

const harness = await AgentHarness.init();

// Turn 1: introduce user information
const turn1 = await harness.runAgent(
  "default-agent",
  "Hello! My name is Alice and I build distributed systems.",
  { sessionId: "session-alice-101" },
);
console.log(turn1.response);

// Turn 2: agent remembers previous turn
const turn2 = await harness.runAgent("default-agent", "What is my name and what do I build?", {
  sessionId: "session-alice-101",
});
console.log(turn2.response);
// Output: "Your name is Alice and you build distributed systems."
```

### Token-Level Streaming

Stream tokens and orchestration events in real time:

```typescript
const eventStream = harness.runAgentStream(
  "default-agent",
  "Write an essay about distributed databases",
);

for await (const event of eventStream) {
  if (event.type === "token:delta") {
    process.stdout.write(event.payload.delta);
  } else if (event.type === "task:start") {
    console.log(`\n[Executing task: ${event.payload.capability}]`);
  }
}
```

### Semantic Long-Term Memory

Store and recall facts semantically:

```typescript
// Explicitly remember a fact
await harness.remember("Production database was upgraded to PostgreSQL 16.2", {
  agentId: "default-agent",
  tags: ["infrastructure", "db"],
});

// Semantic recall
const results = await harness.recall("What database version are we running?", {
  limit: 3,
  minScore: 0.6,
});
console.log(results);
```

### Human-in-the-Loop (HITL) Approvals

Pause sensitive tools and resume on approval:

```typescript
// Define a sensitive tool
const sensitiveTool = {
  id: "tool.deploy",
  name: "Deploy Production",
  description: "Deploys code to production",
  type: "tool" as const,
  requiresApproval: true, // triggers HITL gate
  inputSchema: { type: "object" },
  execute: async (input) => ({ success: true, output: { deployed: true } }),
};

harness.registerTool(sensitiveTool);

// Execution pauses when tool.deploy is called
// Check pending approvals:
const pending = await harness.listPendingApprovals();

// Approve and resume execution:
await harness.approveRun(pending[0].runId, "Approved by Tech Lead");
```

---

## 🌐 HTTP API Reference

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

Pre-configured launch configurations are included in [`.vscode/launch.json`](./.vscode/launch.json):

1. **`Debug: Default Agent (CLI)`**: Debug conversational runs with breakpoints.
2. **`Debug: Tool Execution & Fast Path`**: Debug single/multi-tool calling.
3. **`Debug: Sub-Agent Delegation`**: Debug recursive sub-agent workflows.
4. **`Debug: HTTP & SSE API Server`**: Debug the Hono HTTP server.
5. **`Debug: Current Test File`**: Debug the active test file directly in VS Code.
6. **`Debug: All Test Suites`**: Run all 29 test suites under the debugger.

---

## 📚 Documentation & Deep Dives

- [docs/architecture.md](./docs/architecture.md): Full architectural overview, design patterns, and runtime flow.
- [docs/README.md](./docs/README.md): Documentation map and Mermaid diagram index.
- [docs/diagrams/](./docs/diagrams/): Sequence diagrams for capability loading, tool dispatch, and agent delegation.

---

## 📄 License

MIT License. Designed with extensibility, type safety, and resilience.
