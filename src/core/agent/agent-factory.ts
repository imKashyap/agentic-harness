import { inject, injectable, optional } from "inversify";

import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityResolver } from "../../capabilities/resolution/capability-resolver.js";
import { TYPES } from "../../di/types.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { LLMFactory } from "../../llm/llm-factory.js";
import { MemoryManager } from "../../memory/long-term/memory-manager.js";
import { ContextCompactor } from "../../memory/session/context-compactor.js";
import type { PromptProvider } from "../../prompts/prompt-provider.js";
import { createLogger } from "../../utils/logger.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { Agent } from "./agent.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRunner } from "./agent-runner.js";

const logger = createLogger("AgentFactory");

@injectable()
export class AgentFactory {
  private readonly capabilityResolver: CapabilityResolver;

  constructor(
    @inject(TYPES.CapabilityRegistry) private readonly capabilityRegistry: CapabilityRegistry,
    @inject(TYPES.Orchestrator) private readonly orchestrator: Orchestrator,
    @inject(TYPES.PromptProvider) private readonly promptProvider: PromptProvider,
    @optional() @inject(TYPES.CapabilityResolver) capabilityResolver?: CapabilityResolver,
    @optional() @inject(TYPES.MemoryManager) private readonly memoryManager?: MemoryManager,
    @optional()
    @inject(TYPES.ContextCompactor)
    private readonly contextCompactor?: ContextCompactor,
    @optional() @inject(TYPES.EventBus) private readonly eventBus?: HarnessEventBus,
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
