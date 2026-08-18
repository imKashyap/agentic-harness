# Agentic Harness Documentation

Architecture documentation for the agentic harness — focused diagrams tied to TypeScript classes and files, with explanatory text in Markdown.

## Architecture

See [architecture.md](./architecture.md) for the full guide. Each section links to a Mermaid diagram in [`diagrams/`](./diagrams/).

| Topic                                | Diagram                                                     | Status      |
| ------------------------------------ | ----------------------------------------------------------- | ----------- |
| Overall architecture                 | [capability-loading.mmd](./diagrams/capability-loading.mmd) | Implemented |
| Skill loading & resolution           | [skill-loading.mmd](./diagrams/skill-loading.mmd)           | Implemented |
| Tool registration → LLM definition   | [tool-loading.mmd](./diagrams/tool-loading.mmd)             | Stub        |
| Tool invocation → result → LLM       | [tool-execution.mmd](./diagrams/tool-execution.mmd)         | Implemented |
| Agent config → factory → registry    | [agent-loading.mmd](./diagrams/agent-loading.mmd)           | Implemented |
| Agent capability discovery           | [capability-loading.mmd](./diagrams/capability-loading.mmd) | Implemented |
| Parent → sub-agent delegation        | [agent-delegation.mmd](./diagrams/agent-delegation.mmd)     | Implemented |
| ExecutionContext & parent/child runs | —                                                           | Text only   |
| LLM adapter architecture             | [adapter-flow.mmd](./diagrams/adapter-flow.mmd)             | Partial     |
| End-to-end request lifecycle         | [request-cycle.mmd](./diagrams/request-cycle.mmd)           | Implemented |
| Capability dispatcher decision flow  | [agent-delegation.mmd](./diagrams/agent-delegation.mmd)     | Implemented |
| Future parallel execution            | —                                                           | Planned     |

## Viewing diagrams

`.mmd` files are plain Mermaid source. To preview:

- Open the file in VS Code with a Mermaid extension
- Paste the contents into [mermaid.live](https://mermaid.live)
- Use the Mermaid CLI: `npx @mermaid-js/mermaid-cli -i docs/diagrams/<name>.mmd -o out.svg`

## Source layout

```
src/
├── index.ts                          # Bootstrap: registries, loaders, agents, run
├── core/
│   ├── agent/                        # Agent, AgentRunner, AgentFactory, config
│   └── execution/                    # ExecutionContext
├── capabilities/
│   ├── capability-registry.ts        # Central capability store
│   ├── capability-manager.ts         # Loader orchestration
│   ├── skills/                       # SkillLoader
│   ├── tools/                        # ToolLoader, ToolCallExecutor, ToolExecutor
│   ├── agents/                       # AgentCapabilityLoader, SubAgentExecutor
│   ├── execution/                    # CapabilityDispatcher
│   └── resolution/                   # CapabilityResolver (not wired yet)
├── llm/
│   ├── model.ts                      # LLM interface, Message, ToolCall
│   ├── llm-factory.ts                # Provider selection
│   └── adapters/                     # OpenRouterLLM, MockLLM
└── prompts/                          # FilePromptProvider
```
