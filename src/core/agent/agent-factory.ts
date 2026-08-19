import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { LLMFactory } from "../../llm/llm-factory.js";
import { PromptProvider } from "../../prompts/prompt-provider.js";
import { createLogger } from "../../utils/logger.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { Agent } from "./agent.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRunner } from "./agent-runner.js";

const logger = createLogger("AgentFactory");

export class AgentFactory {
  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly orchestrator: Orchestrator,
    private readonly promptProvider: PromptProvider,
  ) {}

  create(config: AgentConfig): Agent {
    logger.info(
      `Creating agent '${config.id}' (name: ${config.name}, provider: ${config.model.provider}, model: ${config.model.model})`,
    );
    const llm = LLMFactory.create(config.model);

    const runner = new AgentRunner(config, llm, this.capabilityRegistry, this.orchestrator);
    return new Agent(config, this.promptProvider, runner);
  }
}
