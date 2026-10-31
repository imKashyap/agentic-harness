import { inject, injectable, optional } from "inversify";

import { ExecutionContext } from "../../core/execution/execution-context.js";
import { TYPES } from "../../di/types.js";
import type { MessageBus } from "../../infrastructure/messaging/message-bus.js";
import { createLogger } from "../../utils/logger.js";
import { AgentModelConfigRegistry } from "./agent-config-registry.js";
import { ModelConfigResolver } from "./model-config-resolver.js";
import { PostgresConfigStore } from "./postgres-config-store.js";
import { AgentModelConfig, InferenceParameters, ResolvedModelConfig } from "./types.js";

const logger = createLogger("ConfigCache");

export interface ConfigInvalidationEvent {
  agentId?: string;
  version: number;
  timestamp: number;
}

export const CONFIG_INVALIDATION_CHANNEL = "config:invalidation";

@injectable()
export class ConfigCache {
  private readonly cache = new Map<string, ResolvedModelConfig>();
  private readonly lastKnownValid = new Map<string, ResolvedModelConfig>();
  private localVersion = 1;
  private unsubscribe?: () => void;

  constructor(
    @inject(ModelConfigResolver) private readonly resolver: ModelConfigResolver,
    @inject(PostgresConfigStore)
    private readonly configStore: PostgresConfigStore,
    @inject(AgentModelConfigRegistry)
    private readonly agentConfigRegistry: AgentModelConfigRegistry,
    @optional() @inject(TYPES.MessageBus) private readonly messageBus?: MessageBus,
  ) {
    this.localVersion = resolver.getConfigVersion();
    this.initSubscription();
  }

  private initSubscription(): void {
    if (this.messageBus) {
      this.messageBus
        .subscribe(CONFIG_INVALIDATION_CHANNEL, (message: unknown) => {
          const event = message as ConfigInvalidationEvent;
          logger.info(
            `Received config invalidation event (agentId: ${event.agentId ?? "ALL"}, version: ${event.version})`,
          );
          this.handleInvalidation(event);
        })
        .then((unsub) => {
          this.unsubscribe = unsub;
        })
        .catch((err) => {
          logger.warn(`Failed to subscribe to config invalidation channel: ${String(err)}`);
        });
    }
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  public handleInvalidation(event: ConfigInvalidationEvent): void {
    this.localVersion = Math.max(this.localVersion, event.version);
    this.resolver.setConfigVersion(this.localVersion);

    if (event.agentId) {
      this.cache.delete(event.agentId);
      logger.debug(`Evicted cached config for agent '${event.agentId}'`);
    } else {
      this.cache.clear();
      logger.debug(`Evicted all entries from worker config cache`);
    }
  }

  /**
   * Resolves runtime configuration with execution pinning, worker caching,
   * and fallback to last-known-valid configuration.
   */
  public resolve(
    agentId: string,
    context?: ExecutionContext,
    invocationOverrides?: Partial<InferenceParameters>,
  ): ResolvedModelConfig {
    // 1. Check for Execution Pinning (Do NOT modify config midway through a DAG run)
    if (context?.metadata?.pinnedConfig) {
      const pinned = context.metadata.pinnedConfig as ResolvedModelConfig;
      if (pinned.agentId === agentId) {
        logger.debug(
          `Using pinned config v${pinned.configVersion} for execution runId: ${context.runId} (agent: ${agentId})`,
        );
        return pinned;
      }
    }

    // 2. Check local in-memory cache if no ad-hoc invocation overrides are provided
    if (!invocationOverrides && this.cache.has(agentId)) {
      const cached = this.cache.get(agentId)!;
      this.pinContextIfPresent(context, cached);
      return cached;
    }

    // 3. Resolve through ModelConfigResolver with fallback to last known valid
    try {
      const resolved = this.resolver.resolve(agentId, invocationOverrides);

      if (!invocationOverrides) {
        this.cache.set(agentId, resolved);
        this.lastKnownValid.set(agentId, resolved);
      }

      this.pinContextIfPresent(context, resolved);
      return resolved;
    } catch (error) {
      const fallback = this.lastKnownValid.get(agentId);
      if (fallback) {
        logger.warn(
          `Failed to resolve latest config for agent '${agentId}'. Falling back to last known valid config v${fallback.configVersion}. Reason: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        this.pinContextIfPresent(context, fallback);
        return fallback;
      }
      throw error;
    }
  }

  private pinContextIfPresent(
    context: ExecutionContext | undefined,
    config: ResolvedModelConfig,
  ): void {
    if (context) {
      context.metadata = context.metadata ?? {};
      context.metadata.pinnedConfig = config;
      context.metadata.pinnedConfigVersion = config.configVersion;
    }
  }

  /**
   * Periodic reconciliation against the persistent store (PostgreSQL)
   * to catch any missed Pub/Sub events and reconcile versions.
   */
  public async reconcile(): Promise<{ reconciled: boolean; latestVersion: number }> {
    try {
      const latestVersion = await this.configStore.getLatestVersion();
      if (latestVersion > this.localVersion) {
        logger.info(
          `Reconciliation triggered: Remote config v${latestVersion} > Local v${this.localVersion}. Invalidating local cache.`,
        );
        this.localVersion = latestVersion;
        this.resolver.setConfigVersion(latestVersion);
        this.cache.clear();
        return { reconciled: true, latestVersion };
      }
      return { reconciled: false, latestVersion: this.localVersion };
    } catch (err) {
      logger.warn(`Failed to reconcile configuration version: ${String(err)}`);
      return { reconciled: false, latestVersion: this.localVersion };
    }
  }

  /**
   * Atomically updates an agent's configuration, persists it, increments version,
   * updates the local registry, and publishes an invalidation event.
   */
  public async updateAgentConfig(config: AgentModelConfig): Promise<number> {
    // 1. Verify that the referenced model and profile can be resolved
    this.resolver.resolveExplicit(
      config.modelId,
      config.inferenceProfileId,
      config.overrides,
      config.agentId,
    );

    // 2. Persist to Postgres store
    await this.configStore.saveAgentConfig(config);

    // 3. Update in-memory registry
    this.agentConfigRegistry.register(config);

    // 4. Increment version
    const newVersion = await this.configStore.incrementVersion(
      `Updated agent config for '${config.agentId}'`,
    );

    this.localVersion = newVersion;
    this.resolver.setConfigVersion(newVersion);
    this.cache.delete(config.agentId);

    // 5. Publish invalidation event
    if (this.messageBus) {
      const event: ConfigInvalidationEvent = {
        agentId: config.agentId,
        version: newVersion,
        timestamp: Date.now(),
      };
      await this.messageBus.publish(CONFIG_INVALIDATION_CHANNEL, event);
    }

    logger.info(
      `Updated agent config for '${config.agentId}' to v${newVersion} and published invalidation`,
    );
    return newVersion;
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  public clear(): void {
    this.cache.clear();
    this.lastKnownValid.clear();
  }
}
