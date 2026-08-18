# Architecture

This document describes how the agentic harness is wired today. Each section links to a Mermaid diagram in [`diagrams/`](./diagrams/) and points at the TypeScript files that implement the flow.

---

## 1. Overall Agentic Harness Architecture

The harness has three layers: **bootstrap** (startup wiring), **core** (agent lifecycle), and **capabilities** (skills, tools, sub-agents). Everything is composed manually in `src/index.ts` — there is no DI framework.

At startup, the harness:

1. Creates empty registries (`CapabilityRegistry`, `AgentRegistry`)
2. Loads capabilities from disk via `CapabilityManager`
3. Wires executors (`ToolCallExecutor`, `SubAgentExecutor`, `CapabilityDispatcher`)
4. Builds agents via `AgentFactory` and registers them
5. Runs an agent with a user message

**Diagram:** [capability-loading.mmd](./diagrams/capability-loading.mmd) — shows bootstrap wiring and how loaders feed the registry.

**Key files:**

| File                                      | Role                                          |
| ----------------------------------------- | --------------------------------------------- |
| `src/index.ts`                            | Application entry point; wires all components |
| `src/capabilities/capability-registry.ts` | Stores all capabilities by id                 |
| `src/capabilities/capability-manager.ts`  | Runs loaders and registers results            |
| `src/core/agent/agent-factory.ts`         | Creates `Agent` + `AgentRunner` + LLM         |
| `src/core/agent/agent-registry.ts`        | Stores runnable agent instances               |

---

## 2. Skill Loading & Resolution

Skills are file-based instructions loaded from `skills/{name}/`. Each skill directory must contain:

- `metadata.json` — `id`, `name`, `description`
- `SKILL.md` — full skill content (markdown)

`SkillLoader` implements `CapabilityLoader` and is called by `CapabilityManager.load()`. Loaded skills are registered in `CapabilityRegistry` with `type: "skill"`.

**Resolution today:** Skills are loaded and registered, but not yet exposed to the LLM or executed at runtime. `CapabilityResolver` in `src/capabilities/resolution/capability-resolver.ts` can map capabilities into an `LLMCapabilityContext` (skills, tools, agents), but nothing calls it yet. `AgentRunner` reads tools and agents directly from the registry; skills are ignored in the chat loop.

**Diagram:** [skill-loading.mmd](./diagrams/skill-loading.mmd)

**Key files:**

| File                                                 | Role                                     |
| ---------------------------------------------------- | ---------------------------------------- |
| `src/capabilities/skills/skill-loader.ts`            | Reads skill directories from disk        |
| `src/capabilities/skills/skill.ts`                   | `Skill` type extending `Capability`      |
| `src/capabilities/resolution/capability-resolver.ts` | Maps capabilities → LLM context (unused) |
| `skills/greeting/`                                   | Example skill                            |

---

## 3. Tool Registration → LLM Tool Definition

Tools implement the `Tool` interface (`id`, `name`, `description`, `inputSchema`, `execute()`). They are registered in `CapabilityRegistry` with `type: "tool"`.

**Current state:** `ToolLoader` is a stub — `loadAll()` returns `[]` and is not wired in `index.ts`. The intended path is: register tool instances → `CapabilityManager.load()` → `CapabilityRegistry`.

**LLM exposure:** On each iteration, `AgentRunner.getToolDefinitions()` reads all registry entries with `type: "tool"`, resolves each via `CapabilityRegistry.getTool()`, and builds `ToolDefinition[]` (`name`, `description`, `inputSchema`). These are passed to `LLM.chat()` as `request.tools`.

The adapter (`OpenRouterLLM`) maps each tool to an OpenAI-compatible function definition:

```typescript
{ type: "function", function: { name, description, parameters: inputSchema } }
```

**Diagram:** [tool-loading.mmd](./diagrams/tool-loading.mmd) — registration path (stub). See also [adapter-flow.mmd](./diagrams/adapter-flow.mmd) for how tools reach the provider API.

**Key files:**

| File                                                 | Role                                  |
| ---------------------------------------------------- | ------------------------------------- |
| `src/capabilities/tools/tool.ts`                     | `Tool` interface                      |
| `src/capabilities/tools/tool-loader.ts`              | Stub loader (returns empty array)     |
| `src/capabilities/tools/examples/calculator-tool.ts` | Example tool implementation           |
| `src/core/agent/agent-runner.ts`                     | `getToolDefinitions()`                |
| `src/llm/adapters/openrouter/openrouter-llm.ts`      | Maps tools → API function definitions |

---

## 4. Tool Invocation → Execution → Result → LLM

When the LLM returns `toolCalls`, `AgentRunner` loops over each call sequentially and delegates to `CapabilityExecutor.execute()`.

The tool path:

1. `CapabilityDispatcher` looks up the capability by name and routes to `ToolCallExecutor` when `type === "tool"`
2. `ToolCallExecutor` resolves the `Tool` from the registry
3. `ToolExecutor` calls `tool.execute(input, context)`
4. The result is wrapped as `CapabilityExecutionResult` and appended to the message history as a `role: "tool"` message
5. The loop continues — the LLM sees the tool result on the next iteration

**Diagram:** [tool-execution.mmd](./diagrams/tool-execution.mmd)

**Key files:**

| File                                                  | Role                                       |
| ----------------------------------------------------- | ------------------------------------------ |
| `src/core/agent/agent-runner.ts`                      | Iteration loop; dispatches tool calls      |
| `src/capabilities/execution/capability-dispatcher.ts` | Routes by capability type                  |
| `src/capabilities/tools/tool-call-executor.ts`        | Resolves tool and invokes executor         |
| `src/capabilities/tools/tool-executor.ts`             | Thin wrapper around `tool.execute()`       |
| `src/llm/model.ts`                                    | `ToolCall`, `Message`, `LLMResponse` types |

---

## 5. Agent Configuration → AgentFactory → AgentRegistry

Agents are defined on disk under `agents/{id}/agent.json`. The config is validated with Zod (`AgentConfigSchema`) and includes model settings, prompt reference, and capability lists (`skills`, `tools`, `subAgents` — lists are defined but not yet filtered at runtime).

**Construction flow:**

1. `AgentConfigLoader.load(path)` → `AgentConfig`
2. `AgentFactory.create(config)` creates:
   - `LLM` via `LLMFactory.create(config.model)`
   - `AgentRunner` with config, LLM, registry, and executor
   - `Agent` with config, `PromptProvider`, and runner
3. `AgentRegistry.register(config.id, agent)` stores the runnable instance

**Prompt resolution** happens at run time, not construction time. `Agent.run()` calls `FilePromptProvider.getPrompt(config.prompt)` which reads `prompts/agents/{prompt.id}.md`.

**Diagram:** [agent-loading.mmd](./diagrams/agent-loading.mmd)

**Key files:**

| File                                    | Role                             |
| --------------------------------------- | -------------------------------- |
| `src/core/agent/agent-config-loader.ts` | Loads and validates `agent.json` |
| `src/core/agent/agent-config.ts`        | Zod schemas and types            |
| `src/core/agent/agent-factory.ts`       | Wires LLM + runner + agent       |
| `src/core/agent/agent-registry.ts`      | Stores agent instances by id     |
| `src/prompts/file-prompt-provider.ts`   | Reads prompt markdown from disk  |
| `agents/default-agent/agent.json`       | Example agent config             |

---

## 6. Agent Capability Discovery

Sub-agents are discoverable capabilities, separate from runnable agent instances. `AgentCapabilityLoader` scans `agents/` subdirectories, reads each `agent.json`, and produces `AgentCapability` entries with:

- `id`: `agent.{metadata.id}`
- `type`: `"agent"`
- `agentId`: the underlying agent id (used by `SubAgentExecutor` to look up the runnable agent)

These are registered alongside skills via `CapabilityManager.load()`.

**LLM exposure:** `AgentRunner.getAgentDefinitions()` returns all agent capabilities except the current agent (self-delegation is filtered out). Each is exposed to the LLM as a function with a `{ task: string }` input schema.

**Diagram:** [capability-loading.mmd](./diagrams/capability-loading.mmd) — see the `AgentCapabilityLoader` branch.

**Key files:**

| File                                                 | Role                     |
| ---------------------------------------------------- | ------------------------ |
| `src/capabilities/agents/agent-capability-loader.ts` | Scans agent directories  |
| `src/capabilities/agents/agent-capability.ts`        | `AgentCapability` type   |
| `src/core/agent/agent-runner.ts`                     | `getAgentDefinitions()`  |
| `src/capabilities/capability-manager.ts`             | Orchestrates all loaders |

---

## 7. Parent Agent → Sub-Agent Delegation

When the LLM calls an agent capability (e.g. `agent.researcher`), the dispatcher routes to `SubAgentExecutor`.

1. Looks up `AgentCapability` from the registry
2. Resolves the runnable `Agent` from `AgentRegistry` via `capability.agentId`
3. Extracts `{ task }` from the tool call arguments
4. Calls `agent.run({ message: task }, context)` — passing the **parent** `ExecutionContext`
5. Returns the sub-agent's response as `CapabilityExecutionResult.output`

The parent `AgentRunner` appends this as a tool result message and continues its own iteration loop.

**Diagram:** [agent-delegation.mmd](./diagrams/agent-delegation.mmd)

**Key files:**

| File                                                  | Role                              |
| ----------------------------------------------------- | --------------------------------- |
| `src/capabilities/agents/sub-agent-executor.ts`       | Delegates to registered agents    |
| `src/capabilities/execution/capability-dispatcher.ts` | Routes `type: "agent"`            |
| `src/core/agent/agent.ts`                             | Creates child context from parent |
| `src/core/agent/agent-registry.ts`                    | Resolves agent instances          |

---

## 8. ExecutionContext & Parent/Child Runs

Every agent run gets a fresh `ExecutionContext`:

```typescript
interface ExecutionContext {
  runId: string; // crypto.randomUUID()
  agentId: string; // from AgentConfig.id
  parentRunId?: string; // set when delegated from a parent
  parentAgentId?: string;
  metadata?: Record<string, unknown>;
}
```

When a sub-agent is invoked, `SubAgentExecutor` passes the **parent's context** into `agent.run()`. The child agent creates a **new** context with its own `runId` but records `parentRunId` and `parentAgentId` from the parent. This gives a traceable parent/child run tree without sharing mutable state.

`ExecutionContext` is passed through to `tool.execute()` as `ToolContext`, so tools can access run metadata if needed.

**Diagram:** none yet — see section 7 diagram for the delegation path.

**Key files:**

| File                                            | Role                             |
| ----------------------------------------------- | -------------------------------- |
| `src/core/execution/execution-context.ts`       | Context type definition          |
| `src/core/agent/agent.ts`                       | Creates context on `run()`       |
| `src/capabilities/agents/sub-agent-executor.ts` | Forwards parent context to child |

---

## 9. LLM Adapter Architecture

All LLM providers implement the `LLM` interface with a single method: `chat(request: LLMRequest): Promise<LLMResponse>`. The harness uses a provider-agnostic internal model (`Message`, `ToolCall`, `ToolDefinition`, `AgentDefinition`) and lets each adapter translate to/from the provider API.

**Implemented providers:**

| Provider     | Class           | Notes                                                              |
| ------------ | --------------- | ------------------------------------------------------------------ |
| `mock`       | `MockLLM`       | Echoes last user message; for testing                              |
| `openrouter` | `OpenRouterLLM` | OpenAI-compatible API; maps tools + agents to function definitions |

**Planned providers:** OpenAI (direct), LangChain — not implemented. Adding a provider means: implement `LLM`, add a case in `LLMFactory.create()`.

`LLMFactory` is called once per agent in `AgentFactory.create()`, using `config.model.provider` and `config.model.model`.

**Diagram:** [adapter-flow.mmd](./diagrams/adapter-flow.mmd)

**Key files:**

| File                                            | Role                             |
| ----------------------------------------------- | -------------------------------- |
| `src/llm/model.ts`                              | `LLM` interface and shared types |
| `src/llm/llm-factory.ts`                        | Provider switch                  |
| `src/llm/adapters/openrouter/openrouter-llm.ts` | OpenRouter adapter               |
| `src/llm/adapters/mock/mock-llm.ts`             | Mock adapter                     |

---

## 10. Complete End-to-End Request Lifecycle

This is the full path from application startup through a user message to a final response.

**Startup** (`index.ts`):

1. Load agent configs from disk
2. `CapabilityManager.load()` → populate `CapabilityRegistry`
3. Wire executors and `CapabilityDispatcher`
4. `AgentFactory.create()` for each agent → register in `AgentRegistry`

**Run** (`Agent.run()` → `AgentRunner.run()`):

1. Load system prompt from `FilePromptProvider`
2. Create `ExecutionContext`
3. Enter iteration loop (max 10):
   - Gather tool and agent definitions from registry
   - Call `LLM.chat()` with messages + capabilities
   - If no tool calls → return final response
   - For each tool call → `CapabilityDispatcher.execute()` → append tool result message
   - Loop

**Diagram:** [request-cycle.mmd](./diagrams/request-cycle.mmd)

**Key files:** `src/index.ts`, `src/core/agent/agent.ts`, `src/core/agent/agent-runner.ts`

---

## 11. Capability Dispatcher Decision Flow

`CapabilityDispatcher` is the single entry point for executing any capability the LLM invokes. It implements `CapabilityExecutor` and is injected into `AgentRunner`.

```
registry.get(request.name)
  ├── type "tool"  → ToolCallExecutor.execute()
  ├── type "agent" → SubAgentExecutor.execute()
  ├── type "skill" → throw (not supported yet)
  └── unknown      → throw
```

Each downstream executor receives the same `CapabilityExecutionRequest` (`name`, `input`) and `ExecutionContext`. Results are normalized to `CapabilityExecutionResult` (`success`, `output`, `error?`).

**Diagram:** [agent-delegation.mmd](./diagrams/agent-delegation.mmd) — shows the dispatch and routing steps within the agent iteration loop.

**Key files:**

| File                                                  | Role                        |
| ----------------------------------------------------- | --------------------------- |
| `src/capabilities/execution/capability-dispatcher.ts` | Type-based routing          |
| `src/capabilities/execution/capability-executor.ts`   | Shared request/result types |
| `src/capabilities/tools/tool-call-executor.ts`        | Tool branch                 |
| `src/capabilities/agents/sub-agent-executor.ts`       | Agent branch                |

---

## 12. Future: Parallel Execution

**Current behavior:** `AgentRunner` processes tool calls sequentially in a `for` loop. Each call awaits the previous one before continuing.

**Planned behavior:** When the LLM returns multiple tool calls in a single response, execute independent calls concurrently with `Promise.all()` (or a bounded concurrency pool), then append all tool result messages before the next LLM iteration.

Considerations for the future design:

- **Dependency ordering** — some tool calls may depend on others; the LLM may need to express this, or the harness may need heuristics
- **Context isolation** — parallel sub-agent runs each need their own `ExecutionContext` with the same parent reference
- **Error handling** — partial failures in a parallel batch need per-call error results without aborting siblings
- **Rate limits** — concurrent sub-agent runs multiply LLM API calls

**Diagram:** none — planned, not implemented.

**Relevant file today:** `src/core/agent/agent-runner.ts` lines 67–82 (sequential `for` loop).

---

## What's not wired yet

| Feature                     | Status          | Notes                                                                 |
| --------------------------- | --------------- | --------------------------------------------------------------------- |
| `ToolLoader`                | Stub            | Returns `[]`; not registered in bootstrap                             |
| Skill execution             | Not implemented | Dispatcher throws for `type: "skill"`                                 |
| Skill → LLM exposure        | Not implemented | `CapabilityResolver` exists but unused                                |
| Agent config filtering      | Not implemented | `skills`, `tools`, `subAgents` lists in config are ignored at runtime |
| OpenAI / LangChain adapters | Not implemented | Only `mock` and `openrouter`                                          |
| Parallel tool execution     | Not implemented | Sequential loop today                                                 |
