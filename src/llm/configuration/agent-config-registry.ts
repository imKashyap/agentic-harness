import { injectable } from "inversify";

import { HarnessError } from "../../errors/harness-error.js";
import { createLogger } from "../../utils/logger.js";
import { AgentModelConfig, AgentModelConfigSchema } from "./types.js";

const logger = createLogger("AgentModelConfigRegistry");

@injectable()
export class AgentModelConfigRegistry {
  private readonly configs = new Map<string, AgentModelConfig>();

  register(config: AgentModelConfig): void {
    const validated = AgentModelConfigSchema.parse(config);
    this.configs.set(validated.agentId, validated);
    logger.info(
      `Registered agent LLM config for '${validated.agentId}' (modelId: ${validated.modelId}, profileId: ${validated.inferenceProfileId})`,
    );
  }

  get(agentId: string): AgentModelConfig {
    const config = this.configs.get(agentId);
    if (!config) {
      throw new HarnessError(
        `Agent model configuration for '${agentId}' not found`,
        "AGENT_CONFIG_NOT_FOUND",
        404,
      );
    }
    return config;
  }

  has(agentId: string): boolean {
    return this.configs.has(agentId);
  }

  getAll(): AgentModelConfig[] {
    return Array.from(this.configs.values());
  }

  delete(agentId: string): boolean {
    return this.configs.delete(agentId);
  }

  clear(): void {
    this.configs.clear();
  }
}
