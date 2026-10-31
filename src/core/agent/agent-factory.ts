import { inject, injectable, optional } from "inversify";

import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityResolver } from "../../capabilities/resolution/capability-resolver.js";
import { TYPES } from "../../di/types.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { ConfigCache } from "../../llm/configuration/config-cache.js";
import { ResolvedModelConfig } from "../../llm/configuration/types.js";
import { LLMFactory } from "../../llm/llm-factory.js";
import { ModelCatalog } from "../../llm/model-catalog.js";
import { LLM } from "../../llm/types.js";
import { MemoryManager } from "../../memory/long-term/memory-manager.js";
import { ContextCompactor } from "../../memory/session/context-compactor.js";
import type { PromptProvider } from "../../prompts/prompt-provider.js";
import { createLogger } from "../../utils/logger.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { Agent } from "./agent.js";
import { AgentConfig, RuntimeModelConfig } from "./agent-config.js";
import { AgentRunner } from "./agent-runner.js";

const logger = createLogger("AgentFactory");

@injectable()
export class AgentFactory {
  private readonly capabilityResolver: CapabilityResolver;

  constructor(
    @inject(TYPES.CapabilityRegistry) private readonly capabilityRegistry: CapabilityRegistry,
    @inject(TYPES.Orchestrator) private readonly orchestrator: Orchestrator,
    @inject(TYPES.PromptProvider) private readonly promptProvider: PromptProvider,
    @inject(TYPES.ModelCatalog) private readonly modelCatalog: ModelCatalog,
    @optional() @inject(TYPES.CapabilityResolver) capabilityResolver?: CapabilityResolver,
    @optional() @inject(TYPES.MemoryManager) private readonly memoryManager?: MemoryManager,
    @optional()
    @inject(TYPES.ContextCompactor)
    private readonly contextCompactor?: ContextCompactor,
    @optional() @inject(TYPES.EventBus) private readonly eventBus?: HarnessEventBus,
    @optional() @inject(TYPES.ConfigCache) private readonly configCache?: ConfigCache,
  ) {
    this.capabilityResolver = capabilityResolver ?? new CapabilityResolver();
  }

  create(config: AgentConfig): Agent {
    let llm: LLM;
    let modelConfig: RuntimeModelConfig;

    if (this.configCache && this.modelCatalog.agentConfigRegistry.has(config.id)) {
      const resolved: ResolvedModelConfig = this.configCache.resolve(config.id);
      logger.info(
        `Creating agent '${config.id}' from dynamic config (provider: ${resolved.providerId}, model: ${resolved.providerModelId}, version: ${resolved.configVersion})`,
      );
      llm = LLMFactory.createFromResolved(resolved);
      modelConfig = {
        provider: resolved.providerId,
        model: resolved.providerModelId,
        baseURL: resolved.baseURL,
        contextLength: resolved.contextLength,
        generation: {
          temperature: resolved.parameters.temperature,
          maxTokens: resolved.parameters.maxTokens,
          topP: resolved.parameters.topP,
          frequencyPenalty: resolved.parameters.frequencyPenalty,
          presencePenalty: resolved.parameters.presencePenalty,
        },
      };
    } else {
      modelConfig = this.modelCatalog.resolve(config.model);
      logger.info(
        `Creating agent '${config.id}' (name: ${config.name}, provider: ${modelConfig.provider}, model: ${modelConfig.model})`,
      );
      llm = LLMFactory.create(modelConfig);
    }

    const runtimeConfig = { ...config, model: modelConfig };

    const runner = new AgentRunner(
      runtimeConfig,
      llm,
      this.capabilityRegistry,
      this.orchestrator,
      this.capabilityResolver,
      this.memoryManager,
      this.contextCompactor,
      this.eventBus,
      this.configCache,
    );
    return new Agent(runtimeConfig, this.promptProvider, runner);
  }
}
