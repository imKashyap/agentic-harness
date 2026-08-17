import { ModelConfig } from "../core/agent/agent-config.js";
import { MockLLM } from "./adapters/mock/mock-llm.js";
import { OpenRouterLLM } from "./adapters/openrouter/openrouter-llm.js";
import { LLM } from "./model.js";

export class LLMFactory {
  static create(config: ModelConfig): LLM {
    switch (config.provider) {
      case "mock":
        return new MockLLM();

      case "openrouter":
        return new OpenRouterLLM(config.model);

      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }
}
