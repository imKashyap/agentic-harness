import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityResolver } from "../../capabilities/resolution/capability-resolver.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { LLMFactory } from "../../llm/llm-factory.js";
import { MemoryManager } from "../../memory/long-term/memory-manager.js";
import { ContextCompactor } from "../../memory/session/context-compactor.js";
import { PromptProvider } from "../../prompts/prompt-provider.js";
import { createLogger } from "../../utils/logger.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { Agent } from "./agent.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRunner } from "./agent-runner.js";

const logger = createLogger("AgentFactory");

export class AgentFactory {
  private readonly capabilityResolver: CapabilityResolver;

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly orchestrator: Orchestrator,
    private readonly promptProvider: PromptProvider,
    capabilityResolver?: CapabilityResolver,
    private readonly memoryManager?: MemoryManager,
    private readonly contextCompactor?: ContextCompactor,
    private readonly eventBus?: HarnessEventBus,
  ) {
    this.capabilityResolver = capabilityResolver ?? new CapabilityResolver();
  }

  create(config: AgentConfig): Agent {
    logger.info(
      `Creating agent '${config.id}' (name: ${config.name}, provider: ${config.model.provider}, model: ${config.model.model})`,
    );
    const llm = LLMFactory.create(config.model);

    const runner = new AgentRunner(
      config,
      llm,
      this.capabilityRegistry,
      this.orchestrator,
      this.capabilityResolver,
      this.memoryManager,
      this.contextCompactor,
      this.eventBus,
    );
    return new Agent(config, this.promptProvider, runner);
  }
}
