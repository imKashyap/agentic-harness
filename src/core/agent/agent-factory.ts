import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityExecutor } from "../../capabilities/execution/capability-executor.js";
import { LLMFactory } from "../../llm/llm-factory.js";
import { PromptProvider } from "../../prompts/prompt-provider.js";
import { Agent } from "./agent.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRunner } from "./agent-runner.js";

export class AgentFactory {
  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly capabilityExecutor: CapabilityExecutor,
    private readonly promptProvider: PromptProvider,
  ) {}

  create(config: AgentConfig): Agent {
    const llm = LLMFactory.create(config.model);

    const runner = new AgentRunner(config, llm, this.capabilityRegistry, this.capabilityExecutor);

    return new Agent(config, this.promptProvider, runner);
  }
}
