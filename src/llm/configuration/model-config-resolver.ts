import "dotenv/config";

import { inject, injectable } from "inversify";

import { HarnessError } from "../../errors/harness-error.js";
import { createLogger } from "../../utils/logger.js";
import { AgentModelConfigRegistry } from "./agent-config-registry.js";
import { InferenceProfileRegistry } from "./inference-profile-registry.js";
import { ModelRegistry } from "./model-registry.js";
import { ProviderRegistry } from "./provider-registry.js";
import { InferenceParameters, InferenceParametersSchema, ResolvedModelConfig } from "./types.js";
import { validateCapabilities } from "./validation.js";

const logger = createLogger("ModelConfigResolver");

@injectable()
export class ModelConfigResolver {
  private currentVersion = 1;

  constructor(
    @inject(ProviderRegistry) private readonly providerRegistry: ProviderRegistry,
    @inject(ModelRegistry) private readonly modelRegistry: ModelRegistry,
    @inject(InferenceProfileRegistry)
    private readonly profileRegistry: InferenceProfileRegistry,
    @inject(AgentModelConfigRegistry)
    private readonly agentConfigRegistry: AgentModelConfigRegistry,
  ) {}

  public setConfigVersion(version: number): void {
    this.currentVersion = version;
  }

  public getConfigVersion(): number {
    return this.currentVersion;
  }

  resolve(
    agentId: string,
    invocationOverrides?: Partial<InferenceParameters>,
  ): ResolvedModelConfig {
    logger.debug(`Resolving LLM configuration for agent '${agentId}'`);

    const agentConfig = this.agentConfigRegistry.get(agentId);
    return this.resolveExplicit(
      agentConfig.modelId,
      agentConfig.inferenceProfileId,
      this.mergeParameters(agentConfig.overrides, invocationOverrides),
      agentId,
    );
  }

  resolveExplicit(
    modelId: string,
    profileId: string,
    overrides?: Partial<InferenceParameters>,
    agentId: string = "adhoc-agent",
  ): ResolvedModelConfig {
    const model = this.modelRegistry.get(modelId);
    const provider = this.providerRegistry.get(model.providerId);
    const profile = this.profileRegistry.get(profileId);

    // Merge precedence:
    // 1. Provider defaults
    // 2. Model defaults
    // 3. Profile parameters
    // 4. Profile provider/model overrides
    // 5. Agent / explicit overrides
    const profileTargetOverrides = this.mergeParameters(
      profile.providerOverrides?.[provider.id],
      profile.modelOverrides?.[model.id],
    );

    const mergedParams = this.mergeParameters(
      provider.defaultGeneration,
      model.defaultGeneration,
      profile.parameters,
      profileTargetOverrides,
      overrides,
    );

    // Validate merged parameters against model capabilities
    validateCapabilities(mergedParams, model.capabilities, {
      modelId: model.id,
      agentId,
    });

    // Validate parameter bounds through Zod schema
    const validatedParams = InferenceParametersSchema.parse(mergedParams);

    // Secure API key resolution: read ONLY from process.env via apiKeyEnv
    let resolvedApiKey = "";
    if (provider.providerType === "mock") {
      resolvedApiKey = "mock-key";
    } else {
      resolvedApiKey = process.env[provider.apiKeyEnv] || "";
      if (!resolvedApiKey) {
        if (process.env.NODE_ENV === "production") {
          logger.error(
            `Environment variable '${provider.apiKeyEnv}' is not set for provider '${provider.id}'`,
          );
          throw new HarnessError(
            `Missing API key: Environment variable '${provider.apiKeyEnv}' is not configured`,
            "MISSING_API_KEY",
            401,
          );
        }
        resolvedApiKey = `placeholder-${provider.apiKeyEnv.toLowerCase()}`;
      }
    }

    logger.info(
      `Resolved config for agent '${agentId}': provider '${provider.id}' (${provider.providerType}), model '${model.modelId}', profile '${profile.id}', version ${this.currentVersion}`,
    );

    return {
      agentId,
      providerId: provider.id,
      providerType: provider.providerType,
      baseURL: provider.baseURL,
      apiKeyEnv: provider.apiKeyEnv,
      apiKey: resolvedApiKey,
      providerModelId: model.modelId,
      parameters: validatedParams,
      capabilities: model.capabilities,
      contextLength: model.contextLength,
      configVersion: this.currentVersion,
      resolvedAt: Date.now(),
    };
  }

  private mergeParameters(
    ...paramObjects: Array<Partial<InferenceParameters> | undefined>
  ): InferenceParameters {
    const result: InferenceParameters = {};
    let additional: Record<string, unknown> = {};

    for (const obj of paramObjects) {
      if (!obj) continue;

      if (obj.temperature !== undefined) result.temperature = obj.temperature;
      if (obj.maxTokens !== undefined) result.maxTokens = obj.maxTokens;
      if (obj.topP !== undefined) result.topP = obj.topP;
      if (obj.frequencyPenalty !== undefined) result.frequencyPenalty = obj.frequencyPenalty;
      if (obj.presencePenalty !== undefined) result.presencePenalty = obj.presencePenalty;
      if (obj.stop !== undefined) result.stop = obj.stop;
      if (obj.reasoningEffort !== undefined) result.reasoningEffort = obj.reasoningEffort;

      if (obj.additionalParams) {
        additional = { ...additional, ...obj.additionalParams };
      }
    }

    if (Object.keys(additional).length > 0) {
      result.additionalParams = additional;
    }

    return result;
  }
}
