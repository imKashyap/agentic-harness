import { ModelConfig } from "../core/agent/agent-config.js";
import { createLogger } from "../utils/logger.js";
import { MockLLM } from "./adapters/mock/mock-llm.js";
import { OpenRouterLLM } from "./adapters/openrouter/openrouter-llm.js";
import { LLM } from "./model.js";

const logger = createLogger("LLMFactory");

export class LLMFactory {
  static create(config: ModelConfig): LLM {
    logger.info(`Creating LLM adapter for provider '${config.provider}' (model: ${config.model})`);

    switch (config.provider) {
      case "mock":
        return new MockLLM();

      case "openrouter":
        return new OpenRouterLLM(config.model);

      default: {
        const errorMsg = `Unsupported LLM provider: ${config.provider}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }
}
