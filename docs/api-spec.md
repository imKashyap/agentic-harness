# 🌐 Agentic Harness API Specification

This document provides the formal API specification for the **Agentic Harness HTTP & Server-Sent Events (SSE) Server**.

---

## 📑 Table of Contents

- [Overview & Base URL](#-overview--base-url)
- [Data Formats & Headers](#-data-formats--headers)
- [Error Handling & Standard Response Schema](#-error-handling--standard-response-schema)
- [Endpoints](#-endpoints)
  - [1. System & Health](#1-system--health)
    - [`GET /health`](#get-health)
  - [2. Agents & Execution](#2-agents--execution)
    - [`GET /v1/agents`](#get-v1agents)
    - [`POST /v1/agents/:id/runs`](#post-v1agentsidruns)
  - [3. Streaming & Event Catalog (SSE)](#3-streaming--event-catalog-sse)
  - [4. Conversational Sessions](#4-conversational-sessions)
    - [`GET /v1/sessions`](#get-v1sessions)
    - [`GET /v1/sessions/:id`](#get-v1sessionsid)
    - [`DELETE /v1/sessions/:id`](#delete-v1sessionsid)
  - [5. Capabilities & Semantic Memory](#5-capabilities--semantic-memory)
    - [`GET /v1/capabilities`](#get-v1capabilities)
    - [`POST /v1/memory`](#post-v1memory)
    - [`POST /v1/memory/search`](#post-v1memorysearch)
  - [6. Human-in-the-Loop (HITL) Approvals](#6-human-in-the-loop-hitl-approvals)
    - [`GET /v1/approvals`](#get-v1approvals)
    - [`GET /v1/checkpoints/:id`](#get-v1checkpointsid)
    - [`POST /v1/runs/:id/approve`](#post-v1runsidapprove)
    - [`POST /v1/runs/:id/reject`](#post-v1runsidreject)
- [Client Integration Examples](#-client-integration-examples)
  - [JavaScript / TypeScript (Fetch & SSE)](#javascript--typescript-fetch--sse)
  - [Python (HTTPX Stream)](#python-httpx-stream)

---

## 🌐 Overview & Base URL

The default server runs on `http://localhost:3000` (configurable via `PORT` environment variable).

```
Base URL: http://localhost:3000
API Version: v1
Framework: Hono
```

---

## 📦 Data Formats & Headers

| Header         | Value               | Description                                                  |
| :------------- | :------------------ | :----------------------------------------------------------- |
| `Content-Type` | `application/json`  | Required for all `POST` requests with a body                 |
| `Accept`       | `application/json`  | Standard JSON response                                       |
| `Accept`       | `text/event-stream` | Triggers real-time Server-Sent Events (SSE) on run endpoints |

---

## ⚠️ Error Handling & Standard Response Schema

All error responses return a standardized JSON structure with appropriate HTTP status codes:

```json
{
  "success": false,
  "code": "AGENT_NOT_FOUND",
  "error": "Agent 'unknown-agent' not found in registry",
  "details": {
    "agentId": "unknown-agent"
  }
}
```

### Standard Status Codes:

- `200 OK`: Request succeeded.
- `400 Bad Request`: Validation failure (e.g. missing `message` string).
- `404 Not Found`: Entity not found (Agent, Session, Checkpoint).
- `409 Conflict`: Resource collision (e.g. Duplicate capability registration).
- `500 Internal Server Error`: Unhandled execution fault or LLM provider failure.

---

## 🔌 Endpoints

### 1. System & Health

#### `GET /health`

Returns the server status, current uptime, and epoch timestamp.

- **Request**:

  ```bash
  curl http://localhost:3000/health
  ```

- **Response (`200 OK`)**:
  ```json
  {
    "status": "ok",
    "timestamp": 1724784000000,
    "uptime": 128.45
  }
  ```

---

### 2. Agents & Execution

#### `GET /v1/agents`

Lists all available agents registered in the harness.

- **Request**:

  ```bash
  curl http://localhost:3000/v1/agents
  ```

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "agents": [{ "id": "supervisor" }, { "id": "researcher" }]
  }
  ```

---

#### `POST /v1/agents/:id/runs`

Executes an agent run for the specified agent. Supports both **synchronous JSON responses** and **live Server-Sent Events (SSE)**.

- **Path Parameters**:
  - `id` (_string_, required): Unique agent ID (e.g. `supervisor`, `researcher`).

- **Request Headers**:
  - `Content-Type: application/json`
  - `Accept: application/json` (for JSON response) OR `Accept: text/event-stream` (for SSE)

- **Request Body**:

  ```json
  {
    "message": "Calculate (150 * 24) + 400 and summarize.",
    "sessionId": "session-user-101",
    "stream": false,
    "enableLongTermMemory": true
  }
  ```

  | Property               | Type      | Required | Description                                                           |
  | :--------------------- | :-------- | :------- | :-------------------------------------------------------------------- |
  | `message`              | `string`  | **Yes**  | The user prompt or instruction                                        |
  | `sessionId`            | `string`  | No       | ID of conversational session to load and persist history              |
  | `stream`               | `boolean` | No       | If `true`, returns `text/event-stream` regardless of `Accept` header  |
  | `enableLongTermMemory` | `boolean` | No       | Enables semantic memory search and prompt injection (default: `true`) |

- **Synchronous Response (`200 OK` when `stream: false`)**:

  ```json
  {
    "success": true,
    "response": "The calculation (150 * 24) + 400 equals 4,000.",
    "sessionId": "session-user-101",
    "messages": [
      { "role": "system", "content": "You are Supervisor..." },
      { "role": "user", "content": "Calculate (150 * 24) + 400 and summarize." },
      {
        "role": "assistant",
        "toolCalls": [
          {
            "id": "call-1",
            "name": "tool.calculator",
            "input": { "expression": "(150 * 24) + 400" }
          }
        ]
      },
      { "role": "tool", "toolCallId": "call-1", "content": "4000" },
      { "role": "assistant", "content": "The calculation (150 * 24) + 400 equals 4,000." }
    ]
  }
  ```

- **Streaming Response (`200 OK` when `stream: true` or `Accept: text/event-stream`)**:
  ```http
  HTTP/1.1 200 OK
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive

  event: run:start
  data: {"runId":"c4e672","agentId":"supervisor","timestamp":1724784000100,"input":"Calculate (150 * 24) + 400"}

  event: token:delta
  data: {"runId":"c4e672","agentId":"supervisor","timestamp":1724784000150,"delta":"Let"}

  event: token:delta
  data: {"runId":"c4e672","agentId":"supervisor","timestamp":1724784000160,"delta":" me calculate"}

  event: task:start
  data: {"runId":"c4e672","agentId":"supervisor","timestamp":1724784000200,"taskId":"call-1","capability":"tool.calculator","input":{"expression":"(150 * 24) + 400"}}

  event: task:complete
  data: {"runId":"c4e672","agentId":"supervisor","timestamp":1724784000205,"taskId":"call-1","capability":"tool.calculator","output":{"expression":"(150 * 24) + 400","result":4000},"durationMs":5}

  event: token:delta
  data: {"runId":"c4e672","agentId":"supervisor","timestamp":1724784000250,"delta":"The calculation equals 4,000."}

  event: run:end
  data: {"runId":"c4e672","agentId":"supervisor","timestamp":1724784000300,"response":"The calculation equals 4,000.","durationMs":200,"totalMessages":5}
  ```

---

### 3. Streaming & Event Catalog (SSE)

When streaming is enabled, the server emits strongly-typed events in standard SSE wire format (`event: <type>\ndata: <json>\n\n`):

| Event Type               | Payload Fields                                                                           | Description                               |
| :----------------------- | :--------------------------------------------------------------------------------------- | :---------------------------------------- |
| `run:start`              | `runId`, `agentId`, `timestamp`, `input`, `sessionId?`                                   | Emitted when agent begins execution       |
| `token:delta`            | `runId`, `agentId`, `timestamp`, `delta`                                                 | Raw LLM output token chunk                |
| `thought:delta`          | `runId`, `agentId`, `timestamp`, `delta`                                                 | Reasoning / thinking process delta chunk  |
| `tool:call`              | `runId`, `agentId`, `timestamp`, `toolCalls`                                             | LLM requested one or more tool executions |
| `plan:start`             | `runId`, `agentId`, `timestamp`, `toolCallCount`                                         | Planner started DAG graph construction    |
| `plan:generated`         | `runId`, `agentId`, `timestamp`, `plan`                                                  | DAG topological execution plan generated  |
| `task:start`             | `runId`, `agentId`, `timestamp`, `taskId`, `capability`, `input`                         | Specific task began execution             |
| `task:complete`          | `runId`, `agentId`, `timestamp`, `taskId`, `capability`, `output`, `durationMs`          | Task finished successfully                |
| `task:failed`            | `runId`, `agentId`, `timestamp`, `taskId`, `capability`, `error`, `durationMs`           | Task threw an unhandled error             |
| `subagent:delegated`     | `runId`, `agentId`, `timestamp`, `parentAgentId`, `subAgentId`, `task`                   | Sub-agent delegation started              |
| `subagent:completed`     | `runId`, `agentId`, `timestamp`, `parentAgentId`, `subAgentId`, `response`, `durationMs` | Sub-agent finished task                   |
| `memory:recalled`        | `runId`, `agentId`, `timestamp`, `query`, `matchCount`                                   | Semantic memories retrieved and injected  |
| `memory:stored`          | `runId`, `agentId`, `timestamp`, `memoryId`, `content`                                   | Fact persisted to long-term memory        |
| `hitl:approval_required` | `runId`, `agentId`, `timestamp`, `taskId`, `capability`, `input`, `approvalToken`        | Task paused; awaiting human approval      |
| `hitl:approved`          | `runId`, `agentId`, `timestamp`, `taskId`, `capability`, `approvalToken`, `reason?`      | Task approved; execution resumed          |
| `hitl:rejected`          | `runId`, `agentId`, `timestamp`, `taskId`, `capability`, `approvalToken`, `reason?`      | Task rejected; execution halted           |
| `run:end`                | `runId`, `agentId`, `timestamp`, `response`, `durationMs`, `totalMessages`               | Turn completed successfully               |
| `run:error`              | `runId`, `agentId`, `timestamp`, `error`, `sessionId?`                                   | Run terminated with fatal error           |

---

### 4. Conversational Sessions

#### `GET /v1/sessions`

Lists stored multi-turn conversation sessions.

- **Query Parameters**:
  - `agentId` (_string_, optional): Filter sessions by agent.

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "sessions": [
      {
        "id": "session-user-101",
        "agentId": "supervisor",
        "messageCount": 6,
        "createdAt": 1724783000000,
        "updatedAt": 1724784000000
      }
    ]
  }
  ```

---

#### `GET /v1/sessions/:id`

Retrieves full message history and metadata for a specific session.

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "session": {
      "id": "session-user-101",
      "agentId": "supervisor",
      "createdAt": 1724783000000,
      "updatedAt": 1724784000000,
      "messages": [
        { "role": "user", "content": "Hello! My name is Alice." },
        { "role": "assistant", "content": "Hello Alice! How can I help you today?" }
      ]
    }
  }
  ```

---

#### `DELETE /v1/sessions/:id`

Deletes a session and its conversation history.

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "deleted": true
  }
  ```

---

### 5. Capabilities & Semantic Memory

#### `GET /v1/capabilities`

Lists all registered tools, skills, and sub-agents.

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "capabilities": [
      {
        "id": "tool.calculator",
        "name": "Calculator",
        "type": "tool",
        "description": "Evaluates arithmetic expressions"
      },
      {
        "id": "tool.remember_fact",
        "name": "Remember Fact",
        "type": "tool",
        "description": "Stores fact into long-term memory"
      },
      {
        "id": "tool.search_memory",
        "name": "Search Memory",
        "type": "tool",
        "description": "Searches vector memory"
      },
      {
        "id": "skill.greeting",
        "name": "Greeting",
        "type": "skill",
        "description": "Greets users cordially"
      },
      {
        "id": "agent.researcher",
        "name": "Researcher",
        "type": "agent",
        "description": "Performs deep analysis"
      }
    ]
  }
  ```

---

#### `POST /v1/memory`

Explicitly stores a knowledge fact into the vector embedding store.

- **Request Body**:

  ```json
  {
    "fact": "Production database is PostgreSQL 16 on Google Cloud SQL",
    "agentId": "supervisor",
    "tags": ["infrastructure", "database", "gcp"]
  }
  ```

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "memory": {
      "id": "8b7543f1-112d-4c4c-b871-e17394432311",
      "content": "Production database is PostgreSQL 16 on Google Cloud SQL",
      "agentId": "supervisor",
      "tags": ["infrastructure", "database", "gcp"],
      "createdAt": 1724784000000
    }
  }
  ```

---

#### `POST /v1/memory/search`

Performs cosine similarity semantic search over stored memories.

- **Request Body**:

  ```json
  {
    "query": "Which database version do we use in production?",
    "agentId": "supervisor",
    "limit": 3
  }
  ```

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "query": "Which database version do we use in production?",
    "count": 1,
    "results": [
      {
        "content": "Production database is PostgreSQL 16 on Google Cloud SQL",
        "score": 0.88,
        "agentId": "supervisor",
        "tags": ["infrastructure", "database", "gcp"],
        "createdAt": 1724784000000
      }
    ]
  }
  ```

---

### 6. Human-in-the-Loop (HITL) Approvals

#### `GET /v1/approvals`

Lists all pending approval checkpoints waiting for human resolution.

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "pending": [
      {
        "id": "106b3a99-5d7e-4aff-8db2-fc27ca567c17",
        "runId": "run-98124",
        "agentId": "supervisor",
        "taskId": "call-deploy-prod",
        "capability": "tool.deploy",
        "input": { "environment": "production", "version": "v2.4.0" },
        "status": "pending",
        "createdAt": 1724784000000
      }
    ]
  }
  ```

---

#### `GET /v1/checkpoints/:id`

Retrieves details of a specific checkpoint by ID.

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "checkpoint": {
      "id": "106b3a99-5d7e-4aff-8db2-fc27ca567c17",
      "runId": "run-98124",
      "agentId": "supervisor",
      "taskId": "call-deploy-prod",
      "capability": "tool.deploy",
      "input": { "environment": "production", "version": "v2.4.0" },
      "status": "pending",
      "createdAt": 1724784000000
    }
  }
  ```

---

#### `POST /v1/runs/:id/approve`

Approves a suspended task run or checkpoint token.

- **Path Parameters**:
  - `id` (_string_): Checkpoint token ID or active `runId`.

- **Request Body** (optional):

  ```json
  {
    "reason": "Production release verified and approved by QA Lead"
  }
  ```

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "checkpoint": {
      "id": "106b3a99-5d7e-4aff-8db2-fc27ca567c17",
      "status": "approved",
      "reason": "Production release verified and approved by QA Lead",
      "resolvedAt": 1724784050000
    }
  }
  ```

---

#### `POST /v1/runs/:id/reject`

Rejects a suspended task run or checkpoint token.

- **Path Parameters**:
  - `id` (_string_): Checkpoint token ID or active `runId`.

- **Request Body** (optional):

  ```json
  {
    "reason": "Release aborted: load test regressions detected"
  }
  ```

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "checkpoint": {
      "id": "106b3a99-5d7e-4aff-8db2-fc27ca567c17",
      "status": "rejected",
      "reason": "Release aborted: load test regressions detected",
      "resolvedAt": 1724784050000
    }
  }
  ```

---

## 💻 Client Integration Examples

### JavaScript / TypeScript (Fetch & SSE)

```typescript
// 1. Synchronous JSON run
async function runAgent(message: string, sessionId?: string) {
  const response = await fetch("http://localhost:3000/v1/agents/supervisor/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });
  return response.json();
}

// 2. Real-time SSE streaming run
async function streamAgent(message: string) {
  const response = await fetch("http://localhost:3000/v1/agents/supervisor/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ message, stream: true }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("data: ")) {
        const data = JSON.parse(lines[i].slice(6));
        if (data.delta) {
          process.stdout.write(data.delta);
        }
      }
    }
  }
}
```

### Python (HTTPX Stream)

```python
import httpx
import json

def stream_agent(message: str):
    url = "http://localhost:3000/v1/agents/supervisor/runs"
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }
    payload = {
        "message": message,
        "stream": True
    }

    with httpx.stream("POST", url, headers=headers, json=payload, timeout=60.0) as response:
        for line in response.iter_lines():
            if line.startswith("data: "):
                data = json.loads(line[6:])
                if "delta" in data:
                    print(data["delta"], end="", flush=True)
                elif "response" in data:
                    print("\n\n[Finished successfully]")

if __name__ == "__main__":
    stream_agent("What is distributed consensus?")
```
