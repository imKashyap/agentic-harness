import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { z } from "zod";

import { createLogger } from "../../utils/logger.js";
import { AgentModelConfigRegistry } from "./agent-config-registry.js";
import { InferenceProfileRegistry } from "./inference-profile-registry.js";
import { ModelRegistry } from "./model-registry.js";
import { ProviderRegistry } from "./provider-registry.js";
import {
  AgentModelConfigSchema,
  InferenceProfileSchema,
  ModelDefinitionSchema,
  ProviderConfigSchema,
} from "./types.js";

const logger = createLogger("YamlConfigLoader");

const ProvidersFileSchema = z.object({
  providers: z.array(ProviderConfigSchema),
});

const ModelsFileSchema = z.object({
  models: z.array(ModelDefinitionSchema),
});

const ProfilesFileSchema = z.object({
  profiles: z.array(InferenceProfileSchema),
});

const AgentsFileSchema = z.object({
  agents: z.array(AgentModelConfigSchema),
});

export interface YamlLoaderOptions {
  providersPath?: string;
  modelsPath?: string;
  profilesPath?: string;
  agentsPath?: string;
}

export class YamlConfigLoader {
  static loadAll(
    registries: {
      providerRegistry: ProviderRegistry;
      modelRegistry: ModelRegistry;
      profileRegistry: InferenceProfileRegistry;
      agentConfigRegistry: AgentModelConfigRegistry;
    },
    options: YamlLoaderOptions = {},
  ): void {
    const providersPath = options.providersPath ?? "./config/providers.yaml";
    const modelsPath = options.modelsPath ?? "./config/models.yaml";
    const profilesPath = options.profilesPath ?? "./config/inference_profiles.yaml";
    const agentsPath = options.agentsPath ?? "./config/agents.yaml";

    this.loadProviders(registries.providerRegistry, providersPath);
    this.loadModels(registries.modelRegistry, modelsPath);
    this.loadProfiles(registries.profileRegistry, profilesPath);
    this.loadAgents(registries.agentConfigRegistry, agentsPath);

    logger.info("Successfully loaded all YAML configurations into registries");
  }

  static loadProviders(registry: ProviderRegistry, path: string): void {
    try {
      const content = readFileSync(path, "utf-8");
      const parsed = parse(content);
      const data = ProvidersFileSchema.parse(parsed);
      for (const p of data.providers) {
        registry.register(p);
      }
      logger.info(`Loaded ${data.providers.length} provider(s) from '${path}'`);
    } catch (err) {
      logger.warn(`Could not load providers YAML from '${path}': ${String(err)}`);
    }
  }

  static loadModels(registry: ModelRegistry, path: string): void {
    try {
      const content = readFileSync(path, "utf-8");
      const parsed = parse(content);
      const data = ModelsFileSchema.parse(parsed);
      for (const m of data.models) {
        registry.register(m);
      }
      logger.info(`Loaded ${data.models.length} model(s) from '${path}'`);
    } catch (err) {
      logger.warn(`Could not load models YAML from '${path}': ${String(err)}`);
    }
  }

  static loadProfiles(registry: InferenceProfileRegistry, path: string): void {
    try {
      const content = readFileSync(path, "utf-8");
      const parsed = parse(content);
      const data = ProfilesFileSchema.parse(parsed);
      for (const p of data.profiles) {
        registry.register(p);
      }
      logger.info(`Loaded ${data.profiles.length} profile(s) from '${path}'`);
    } catch (err) {
      logger.warn(`Could not load profiles YAML from '${path}': ${String(err)}`);
    }
  }

  static loadAgents(registry: AgentModelConfigRegistry, path: string): void {
    try {
      const content = readFileSync(path, "utf-8");
      const parsed = parse(content);
      const data = AgentsFileSchema.parse(parsed);
      for (const a of data.agents) {
        registry.register(a);
      }
      logger.info(`Loaded ${data.agents.length} agent config(s) from '${path}'`);
    } catch (err) {
      logger.warn(`Could not load agents YAML from '${path}': ${String(err)}`);
    }
  }
}
