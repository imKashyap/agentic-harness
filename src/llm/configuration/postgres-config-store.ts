import { inject, injectable } from "inversify";

import { TYPES } from "../../di/types.js";
import type { RelationalDb } from "../../infrastructure/postgres/postgres-store.js";
import { createLogger } from "../../utils/logger.js";
import { AgentModelConfig, InferenceProfile, ModelDefinition, ProviderConfig } from "./types.js";

const logger = createLogger("PostgresConfigStore");

@injectable()
export class PostgresConfigStore {
  // In-memory fallback/cache state for environments running with MockPostgresStore
  private readonly memoryProviders = new Map<string, ProviderConfig>();
  private readonly memoryModels = new Map<string, ModelDefinition>();
  private readonly memoryProfiles = new Map<string, InferenceProfile>();
  private readonly memoryAgentConfigs = new Map<string, AgentModelConfig>();
  private currentVersion = 1;

  constructor(@inject(TYPES.RelationalDb) private readonly db: RelationalDb) {}

  async saveProvider(provider: ProviderConfig): Promise<void> {
    this.memoryProviders.set(provider.id, provider);
    await this.db.execute(
      `INSERT INTO llm_providers (id, name, provider_type, base_url, api_key_env, timeout_ms, max_retries, default_headers, default_generation, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         provider_type = EXCLUDED.provider_type,
         base_url = EXCLUDED.base_url,
         api_key_env = EXCLUDED.api_key_env,
         timeout_ms = EXCLUDED.timeout_ms,
         max_retries = EXCLUDED.max_retries,
         default_headers = EXCLUDED.default_headers,
         default_generation = EXCLUDED.default_generation,
         updated_at = NOW();`,
      [
        provider.id,
        provider.name,
        provider.providerType,
        provider.baseURL,
        provider.apiKeyEnv,
        provider.timeoutMs ?? null,
        provider.maxRetries ?? null,
        JSON.stringify(provider.defaultHeaders ?? {}),
        JSON.stringify(provider.defaultGeneration ?? {}),
      ],
    );
    logger.debug(`Persisted provider '${provider.id}' to PostgreSQL store`);
  }

  async getProvider(id: string): Promise<ProviderConfig | null> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      provider_type: ProviderConfig["providerType"];
      base_url: string;
      api_key_env: string;
      timeout_ms?: number;
      max_retries?: number;
      default_headers?: Record<string, string>;
      default_generation?: ProviderConfig["defaultGeneration"];
    }>(`SELECT * FROM llm_providers WHERE id = $1`, [id]);

    if (rows.length > 0) {
      const r = rows[0]!;
      return {
        id: r.id,
        name: r.name,
        providerType: r.provider_type,
        baseURL: r.base_url,
        apiKeyEnv: r.api_key_env,
        timeoutMs: r.timeout_ms,
        maxRetries: r.max_retries,
        defaultHeaders: r.default_headers,
        defaultGeneration: r.default_generation,
      };
    }
    return this.memoryProviders.get(id) ?? null;
  }

  async listProviders(): Promise<ProviderConfig[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      provider_type: ProviderConfig["providerType"];
      base_url: string;
      api_key_env: string;
      timeout_ms?: number;
      max_retries?: number;
      default_headers?: Record<string, string>;
      default_generation?: ProviderConfig["defaultGeneration"];
    }>(`SELECT * FROM llm_providers ORDER BY id ASC`);

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        providerType: r.provider_type,
        baseURL: r.base_url,
        apiKeyEnv: r.api_key_env,
        timeoutMs: r.timeout_ms,
        maxRetries: r.max_retries,
        defaultHeaders: r.default_headers,
        defaultGeneration: r.default_generation,
      }));
    }
    return Array.from(this.memoryProviders.values());
  }

  async saveModel(model: ModelDefinition): Promise<void> {
    this.memoryModels.set(model.id, model);
    await this.db.execute(
      `INSERT INTO llm_models (id, name, provider_id, model_id, context_length, capabilities, default_generation, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         provider_id = EXCLUDED.provider_id,
         model_id = EXCLUDED.model_id,
         context_length = EXCLUDED.context_length,
         capabilities = EXCLUDED.capabilities,
         default_generation = EXCLUDED.default_generation,
         metadata = EXCLUDED.metadata,
         updated_at = NOW();`,
      [
        model.id,
        model.name,
        model.providerId,
        model.modelId,
        model.contextLength ?? null,
        JSON.stringify(model.capabilities),
        JSON.stringify(model.defaultGeneration ?? {}),
        JSON.stringify(model.metadata ?? {}),
      ],
    );
    logger.debug(`Persisted model '${model.id}' to PostgreSQL store`);
  }

  async getModel(id: string): Promise<ModelDefinition | null> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      provider_id: string;
      model_id: string;
      context_length?: number;
      capabilities: ModelDefinition["capabilities"];
      default_generation?: ModelDefinition["defaultGeneration"];
      metadata?: Record<string, unknown>;
    }>(`SELECT * FROM llm_models WHERE id = $1`, [id]);

    if (rows.length > 0) {
      const r = rows[0]!;
      return {
        id: r.id,
        name: r.name,
        providerId: r.provider_id,
        modelId: r.model_id,
        contextLength: r.context_length,
        capabilities: r.capabilities,
        defaultGeneration: r.default_generation,
        metadata: r.metadata,
      };
    }
    return this.memoryModels.get(id) ?? null;
  }

  async listModels(): Promise<ModelDefinition[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      provider_id: string;
      model_id: string;
      context_length?: number;
      capabilities: ModelDefinition["capabilities"];
      default_generation?: ModelDefinition["defaultGeneration"];
      metadata?: Record<string, unknown>;
    }>(`SELECT * FROM llm_models ORDER BY id ASC`);

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        providerId: r.provider_id,
        modelId: r.model_id,
        contextLength: r.context_length,
        capabilities: r.capabilities,
        defaultGeneration: r.default_generation,
        metadata: r.metadata,
      }));
    }
    return Array.from(this.memoryModels.values());
  }

  async saveProfile(profile: InferenceProfile): Promise<void> {
    this.memoryProfiles.set(profile.id, profile);
    await this.db.execute(
      `INSERT INTO llm_inference_profiles (id, name, parameters, provider_overrides, model_overrides, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         parameters = EXCLUDED.parameters,
         provider_overrides = EXCLUDED.provider_overrides,
         model_overrides = EXCLUDED.model_overrides,
         updated_at = NOW();`,
      [
        profile.id,
        profile.name,
        JSON.stringify(profile.parameters),
        JSON.stringify(profile.providerOverrides ?? {}),
        JSON.stringify(profile.modelOverrides ?? {}),
      ],
    );
    logger.debug(`Persisted inference profile '${profile.id}' to PostgreSQL store`);
  }

  async getProfile(id: string): Promise<InferenceProfile | null> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      parameters: InferenceProfile["parameters"];
      provider_overrides?: InferenceProfile["providerOverrides"];
      model_overrides?: InferenceProfile["modelOverrides"];
    }>(`SELECT * FROM llm_inference_profiles WHERE id = $1`, [id]);

    if (rows.length > 0) {
      const r = rows[0]!;
      return {
        id: r.id,
        name: r.name,
        parameters: r.parameters,
        providerOverrides: r.provider_overrides,
        modelOverrides: r.model_overrides,
      };
    }
    return this.memoryProfiles.get(id) ?? null;
  }

  async listProfiles(): Promise<InferenceProfile[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      parameters: InferenceProfile["parameters"];
      provider_overrides?: InferenceProfile["providerOverrides"];
      model_overrides?: InferenceProfile["modelOverrides"];
    }>(`SELECT * FROM llm_inference_profiles ORDER BY id ASC`);

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        parameters: r.parameters,
        providerOverrides: r.provider_overrides,
        modelOverrides: r.model_overrides,
      }));
    }
    return Array.from(this.memoryProfiles.values());
  }

  async saveAgentConfig(config: AgentModelConfig): Promise<void> {
    this.memoryAgentConfigs.set(config.agentId, config);
    await this.db.execute(
      `INSERT INTO agent_llm_configs (agent_id, model_id, inference_profile_id, overrides, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (agent_id) DO UPDATE SET
         model_id = EXCLUDED.model_id,
         inference_profile_id = EXCLUDED.inference_profile_id,
         overrides = EXCLUDED.overrides,
         updated_at = NOW();`,
      [
        config.agentId,
        config.modelId,
        config.inferenceProfileId,
        JSON.stringify(config.overrides ?? {}),
      ],
    );
    logger.debug(`Persisted agent config for '${config.agentId}' to PostgreSQL store`);
  }

  async getAgentConfig(agentId: string): Promise<AgentModelConfig | null> {
    const rows = await this.db.query<{
      agent_id: string;
      model_id: string;
      inference_profile_id: string;
      overrides?: AgentModelConfig["overrides"];
    }>(`SELECT * FROM agent_llm_configs WHERE agent_id = $1`, [agentId]);

    if (rows.length > 0) {
      const r = rows[0]!;
      return {
        agentId: r.agent_id,
        modelId: r.model_id,
        inferenceProfileId: r.inference_profile_id,
        overrides: r.overrides,
      };
    }
    return this.memoryAgentConfigs.get(agentId) ?? null;
  }

  async listAgentConfigs(): Promise<AgentModelConfig[]> {
    const rows = await this.db.query<{
      agent_id: string;
      model_id: string;
      inference_profile_id: string;
      overrides?: AgentModelConfig["overrides"];
    }>(`SELECT * FROM agent_llm_configs ORDER BY agent_id ASC`);

    if (rows.length > 0) {
      return rows.map((r) => ({
        agentId: r.agent_id,
        modelId: r.model_id,
        inferenceProfileId: r.inference_profile_id,
        overrides: r.overrides,
      }));
    }
    return Array.from(this.memoryAgentConfigs.values());
  }

  async incrementVersion(description?: string): Promise<number> {
    this.currentVersion++;
    await this.db.execute(
      `INSERT INTO llm_config_versions (version, updated_at, description)
       VALUES ($1, NOW(), $2)`,
      [this.currentVersion, description ?? `Config update to v${this.currentVersion}`],
    );
    logger.info(`Incremented config version to ${this.currentVersion}`);
    return this.currentVersion;
  }

  async getLatestVersion(): Promise<number> {
    const rows = await this.db.query<{ version: number | string }>(
      `SELECT MAX(version) as version FROM llm_config_versions`,
    );
    if (rows.length > 0 && rows[0]?.version) {
      return Number(rows[0].version);
    }
    return this.currentVersion;
  }
}
