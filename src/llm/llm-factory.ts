import { RuntimeModelConfig } from "../core/agent/agent-config.js";
import { HarnessError } from "../errors/harness-error.js";
import { createLogger } from "../utils/logger.js";
import { MockLLM } from "./adapters/mock/mock-llm.js";
import { OpenRouterLLM } from "./adapters/openrouter/openrouter-llm.js";
import { AnthropicLLM } from "./anthropic.js";
import { ResolvedModelConfig } from "./configuration/types.js";
import { OpenAILLM } from "./openai.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "./types.js";

const logger = createLogger("LLMFactory");

export class ConfiguredLLM implements LLM {
  constructor(
    private readonly adapter: LLM,
    public readonly config: ResolvedModelConfig,
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const mergedRequest = this.buildRequest(request);
    return this.adapter.chat(mergedRequest);
  }

  async *chatStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const mergedRequest = this.buildRequest(request);
    if (typeof this.adapter.chatStream === "function") {
      yield* this.adapter.chatStream(mergedRequest);
    } else {
      const resp = await this.adapter.chat(mergedRequest);
      yield { type: "content", delta: resp.content, fullResponse: resp };
    }
  }

  private buildRequest(request: LLMRequest): LLMRequest {
    return {
      ...request,
      model: request.model ?? this.config.providerModelId,
      temperature: request.temperature ?? this.config.parameters.temperature,
      maxTokens: request.maxTokens ?? this.config.parameters.maxTokens,
      topP: request.topP ?? this.config.parameters.topP,
      frequencyPenalty: request.frequencyPenalty ?? this.config.parameters.frequencyPenalty,
      presencePenalty: request.presencePenalty ?? this.config.parameters.presencePenalty,
      stop: request.stop ?? this.config.parameters.stop,
      reasoningEffort: request.reasoningEffort ?? this.config.parameters.reasoningEffort,
      tokenParamName: request.tokenParamName ?? this.config.capabilities.tokenParamName,
      additionalParams: {
        ...(this.config.parameters.additionalParams ?? {}),
        ...(request.additionalParams ?? {}),
      },
    };
  }
}

export class LLMFactory {
  private static adapterPool = new Map<string, LLM>();

  static getPoolSize(): number {
    return this.adapterPool.size;
  }

  static clearPool(): void {
    this.adapterPool.clear();
  }

  static getOrCreateAdapter(
    providerType: string,
    baseURL: string,
    apiKeyEnv: string,
    apiKey?: string,
    defaultModel?: string,
  ): LLM {
    const poolKey = `${providerType.toLowerCase()}::${baseURL}::${apiKeyEnv}`;
    const cached = this.adapterPool.get(poolKey);
    if (cached) {
      return cached;
    }

    logger.info(
      `Instantiating new pooled client adapter for provider type '${providerType}' (${baseURL})`,
    );
    let adapter: LLM;

    switch (providerType) {
      case "mock":
        adapter = new MockLLM();
        break;

      case "openrouter":
        adapter = new OpenRouterLLM({
          baseURL: baseURL || undefined,
          apiKey,
          model: defaultModel,
        });
        break;

      case "openai":
      case "openai-compatible":
        adapter = new OpenAILLM({
          baseURL: baseURL || undefined,
          apiKey,
          defaultModel,
        });
        break;

      case "anthropic":
        adapter = new AnthropicLLM({
          baseURL: baseURL || undefined,
          apiKey,
          defaultModel,
        });
        break;

      default: {
        const errorMsg = `Unsupported LLM provider type: ${providerType}`;
        logger.error(errorMsg);
        throw new HarnessError(errorMsg, "UNSUPPORTED_PROVIDER", 400);
      }
    }

    this.adapterPool.set(poolKey, adapter);
    return adapter;
  }

  static createFromResolved(config: ResolvedModelConfig): ConfiguredLLM {
    const adapter = this.getOrCreateAdapter(
      config.providerType,
      config.baseURL,
      config.apiKeyEnv,
      config.apiKey,
      config.providerModelId,
    );
    return new ConfiguredLLM(adapter, config);
  }

  static create(config: RuntimeModelConfig): LLM {
    const apiKeyEnv =
      config.provider === "openrouter"
        ? "OPENROUTER_API_KEY"
        : config.provider === "openai"
          ? "OPENAI_API_KEY"
          : config.provider === "anthropic"
            ? "ANTHROPIC_API_KEY"
            : "MOCK_API_KEY";

    return this.getOrCreateAdapter(
      config.provider,
      config.baseURL ?? "",
      apiKeyEnv,
      process.env[apiKeyEnv] || "mock-key",
      config.model,
    );
  }
}
