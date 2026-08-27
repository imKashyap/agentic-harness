import { injectable } from "inversify";

import { createLogger } from "../observability/logging.js";
import { CircuitBreaker, withFallback } from "../resilience/index.js";
import { AnthropicLLM } from "./anthropic.js";
import { MockLLM } from "./mock-llm.js";
import { OpenAILLM } from "./openai.js";
import { OpenRouterLLM } from "./openrouter.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "./types.js";

const logger = createLogger("ModelRouter");

export interface ProviderRouteConfig {
  provider: "openrouter" | "openai" | "anthropic" | "mock" | string;
  model?: string;
  fallbackProvider?: "openrouter" | "openai" | "anthropic" | "mock" | string;
  fallbackModel?: string;
}

@injectable()
export class ModelRouter implements LLM {
  private adapters = new Map<string, LLM>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private fallbackRoutes = new Map<string, ProviderRouteConfig>();

  constructor() {
    this.registerAdapter("mock", new MockLLM());
    this.registerAdapter("openrouter", new OpenRouterLLM());
    this.registerAdapter("openai", new OpenAILLM());
    this.registerAdapter("anthropic", new AnthropicLLM());
  }

  public registerAdapter(provider: string, adapter: LLM): void {
    const key = provider.toLowerCase();
    this.adapters.set(key, adapter);
    this.circuitBreakers.set(
      key,
      new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 15000,
        label: `CircuitBreaker:${provider}`,
      }),
    );
  }

  public setFallback(config: ProviderRouteConfig): void {
    this.fallbackRoutes.set(config.provider.toLowerCase(), config);
  }

  public getCircuitBreaker(provider: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(provider.toLowerCase());
  }

  public getAdapter(provider: string, model?: string): LLM {
    const key = provider.toLowerCase();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      logger.warn(`Provider '${provider}' not explicitly configured, defaulting to OpenRouter`);
      return new OpenRouterLLM(model);
    }
    if (key === "openrouter" && model) {
      return new OpenRouterLLM(model);
    }
    return adapter;
  }

  async chat(request: LLMRequest, primaryProvider: string = "openrouter"): Promise<LLMResponse> {
    const routeConfig = this.fallbackRoutes.get(primaryProvider.toLowerCase());
    const primaryAdapter = this.getAdapter(primaryProvider, request.model);
    const breaker = this.circuitBreakers.get(primaryProvider.toLowerCase());

    const executePrimary = async () => {
      if (breaker) {
        return breaker.execute(() => primaryAdapter.chat(request));
      }
      return primaryAdapter.chat(request);
    };

    if (!routeConfig?.fallbackProvider) {
      return executePrimary();
    }

    return withFallback(
      {
        primary: executePrimary,
        fallback: async (err) => {
          logger.warn(
            `Primary LLM provider '${primaryProvider}' failed. Switching to fallback provider '${
              routeConfig.fallbackProvider
            }' (model: ${routeConfig.fallbackModel ?? "default"}). Error: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );

          const fallbackRequest: LLMRequest = {
            ...request,
            model: routeConfig.fallbackModel ?? request.model,
          };
          const fallbackAdapter = this.getAdapter(
            routeConfig.fallbackProvider!,
            fallbackRequest.model,
          );
          const fallbackBreaker = this.circuitBreakers.get(
            routeConfig.fallbackProvider!.toLowerCase(),
          );

          if (fallbackBreaker) {
            return fallbackBreaker.execute(() => fallbackAdapter.chat(fallbackRequest));
          }
          return fallbackAdapter.chat(fallbackRequest);
        },
      },
      `ModelRouter chat fallback (${primaryProvider} -> ${routeConfig.fallbackProvider})`,
    );
  }

  async *chatStream(
    request: LLMRequest,
    primaryProvider: string = "openrouter",
  ): AsyncIterable<LLMStreamChunk> {
    const adapter = this.getAdapter(primaryProvider, request.model);
    if (adapter.chatStream) {
      yield* adapter.chatStream(request);
    } else {
      const resp = await adapter.chat(request);
      yield { type: "content", delta: resp.content, fullResponse: resp };
    }
  }
}
