import { existsSync, readFileSync } from "node:fs";

import { parse } from "yaml";
import { z } from "zod";

import {
  GenerationConfigSchema,
  ModelConfig,
  RuntimeModelConfig,
} from "../core/agent/agent-config.js";
import { HarnessError } from "../errors/harness-error.js";
import { createLogger } from "../utils/logger.js";
import { AgentModelConfigRegistry } from "./configuration/agent-config-registry.js";
import { InferenceProfileRegistry } from "./configuration/inference-profile-registry.js";
import { ModelConfigResolver } from "./configuration/model-config-resolver.js";
import { ModelRegistry } from "./configuration/model-registry.js";
import { ProviderRegistry } from "./configuration/provider-registry.js";
import { YamlConfigLoader } from "./configuration/yaml-loader.js";

const logger = createLogger("ModelCatalog");

const CatalogModelSchema = z.object({
  id: z.string().min(1),
  contextLength: z.number().int().positive().optional(),
  generation: GenerationConfigSchema.optional(),
});

const ProviderSchema = z.object({
  baseURL: z.string().url(),
  models: z.array(CatalogModelSchema).min(1),
});

const ModelReferenceSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const LegacyModelsFileSchema = z.object({
  providers: z.record(z.string(), ProviderSchema),
  defaults: z.record(z.string(), ModelReferenceSchema).optional(),
});

type ProviderConfig = z.infer<typeof ProviderSchema>;

export class ModelCatalog {
  private readonly providers: Record<string, ProviderConfig> = {};
  private readonly defaults: Record<string, ModelConfig> = {};

  public readonly providerRegistry = new ProviderRegistry();
  public readonly modelRegistry = new ModelRegistry();
  public readonly profileRegistry = new InferenceProfileRegistry();
  public readonly agentConfigRegistry = new AgentModelConfigRegistry();
  public readonly resolver: ModelConfigResolver;

  constructor(path = "./config/models.yaml") {
    this.resolver = new ModelConfigResolver(
      this.providerRegistry,
      this.modelRegistry,
      this.profileRegistry,
      this.agentConfigRegistry,
    );

    // 1. Try loading modern modular YAML files if providers.yaml exists
    if (existsSync("./config/providers.yaml")) {
      YamlConfigLoader.loadAll({
        providerRegistry: this.providerRegistry,
        modelRegistry: this.modelRegistry,
        profileRegistry: this.profileRegistry,
        agentConfigRegistry: this.agentConfigRegistry,
      });
    }

    // 2. Also parse the specified catalog path
    if (existsSync(path)) {
      let content: string;
      try {
        content = readFileSync(path, "utf-8");
      } catch (error) {
        const message = `Failed to read model catalog at '${path}': ${error instanceof Error ? error.message : String(error)}`;
        logger.error(message);
        throw new Error(message, { cause: error });
      }

      let rawConfig: unknown;
      try {
        rawConfig = parse(content);
      } catch (error) {
        const message = `Invalid YAML in model catalog at '${path}': ${error instanceof Error ? error.message : String(error)}`;
        logger.error(message);
        throw new Error(message, { cause: error });
      }

      // Check if it matches legacy schema
      const legacyResult = LegacyModelsFileSchema.safeParse(rawConfig);
      if (legacyResult.success) {
        this.providers = legacyResult.data.providers;
        this.defaults = legacyResult.data.defaults ?? {};
        this.validateUniqueModelIds();
      } else {
        // Populate modern models registry from the models array if present
        if (typeof rawConfig === "object" && rawConfig !== null && "models" in rawConfig) {
          YamlConfigLoader.loadModels(this.modelRegistry, path);
        }
      }
    }

    // Ensure standard providers and models exist in catalog map for resolve()
    this.populateProvidersFromRegistry();

    logger.info(
      `Loaded model catalog with ${Object.keys(this.providers).length} provider(s) and ${this.modelRegistry.getAll().length} modern models`,
    );
  }

  private populateProvidersFromRegistry(): void {
    for (const p of this.providerRegistry.getAll()) {
      const models = this.modelRegistry.getByProvider(p.id).map((m) => {
        let generation: Record<string, unknown> | undefined;
        if (m.defaultGeneration) {
          generation = Object.fromEntries(
            Object.entries({
              temperature: m.defaultGeneration.temperature,
              maxTokens: m.defaultGeneration.maxTokens,
              topP: m.defaultGeneration.topP,
              frequencyPenalty: m.defaultGeneration.frequencyPenalty,
              presencePenalty: m.defaultGeneration.presencePenalty,
            }).filter(([, v]) => v !== undefined),
          );
        }

        return {
          id: m.modelId,
          contextLength: m.contextLength,
          generation,
        };
      });

      this.providers[p.id] = {
        baseURL: p.baseURL || "https://api.example.com",
        models: models.length > 0 ? models : [{ id: "default" }],
      };
    }
  }

  resolve(reference: ModelConfig): RuntimeModelConfig {
    if (reference.provider === "mock") {
      return { ...reference };
    }

    const provider = this.providers[reference.provider];
    if (!provider) {
      throw new HarnessError(
        `Provider '${reference.provider}' is not defined in the model catalog`,
        "UNSUPPORTED_PROVIDER",
        400,
      );
    }

    const model = provider.models.find((entry) => entry.id === reference.model);
    if (!model) {
      throw new HarnessError(
        `Model '${reference.model}' is not defined for provider '${reference.provider}' in the model catalog`,
        "MODEL_NOT_FOUND",
        400,
      );
    }

    return {
      ...reference,
      baseURL: provider.baseURL,
      contextLength: model.contextLength,
      generation: model.generation,
    };
  }

  getDefault(name: string): RuntimeModelConfig {
    const reference = this.defaults[name];
    if (!reference) {
      throw new HarnessError(
        `Default model '${name}' is not defined in the model catalog`,
        "MODEL_NOT_FOUND",
        500,
      );
    }
    return this.resolve(reference);
  }

  private validateUniqueModelIds(): void {
    for (const [providerName, provider] of Object.entries(this.providers)) {
      const seen = new Set<string>();
      for (const model of provider.models) {
        if (seen.has(model.id)) {
          throw new Error(`Duplicate model id '${model.id}' for provider '${providerName}'`);
        }
        seen.add(model.id);
      }
    }
  }
}
