import { injectable } from "inversify";

import { createLogger } from "../utils/logger.js";
import { AnthropicLLM } from "./anthropic.js";
import { MockLLM } from "./mock-llm.js";
import { OpenAILLM } from "./openai.js";
import { OpenRouterLLM } from "./openrouter.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "./types.js";

const logger = createLogger("ModelRouter");

export interface ProviderRouteConfig {
  provider: "openrouter" | "openai" | "anthropic" | "mock";
  model?: string;
  fallbackProvider?: "openrouter" | "openai" | "anthropic" | "mock";
  fallbackModel?: string;
}

@injectable()
export class ModelRouter implements LLM {
  private adapters = new Map<string, LLM>();

  constructor() {
    this.adapters.set("mock", new MockLLM());
    this.adapters.set("openrouter", new OpenRouterLLM());
    this.adapters.set("openai", new OpenAILLM());
    this.adapters.set("anthropic", new AnthropicLLM());
  }

  public getAdapter(provider: string, model?: string): LLM {
    const adapter = this.adapters.get(provider.toLowerCase());
    if (!adapter) {
      logger.warn(`Provider '${provider}' not explicitly configured, defaulting to OpenRouter`);
      return new OpenRouterLLM(model);
    }
    if (provider === "openrouter" && model) {
      return new OpenRouterLLM(model);
    }
    return adapter;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const adapter = this.getAdapter("openrouter", request.model);
    return adapter.chat(request);
  }

  async *chatStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const adapter = this.getAdapter("openrouter", request.model);
    if (adapter.chatStream) {
      yield* adapter.chatStream(request);
    } else {
      const resp = await adapter.chat(request);
      yield { type: "content", delta: resp.content, fullResponse: resp };
    }
  }
}
