import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { AgentConfig, AgentConfigSchema } from "../../core/agent/agent-config.js";
import { createLogger } from "../../utils/logger.js";
import { CapabilityLoaderInterface } from "../capability-loader.js";
import { AgentCapability } from "./agent-capability.js";

const logger = createLogger("AgentCapabilityLoader");

export class AgentCapabilityLoader implements CapabilityLoaderInterface {
  private discoveredConfigs: AgentConfig[] = [];

  constructor(private readonly agentsPath: string) {}

  async loadAgentConfigs(): Promise<AgentConfig[]> {
    logger.debug(`Scanning for agent configs in: ${this.agentsPath}`);

    let entries;
    try {
      entries = await readdir(this.agentsPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `Agents directory not accessible at '${this.agentsPath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }

    const configs: AgentConfig[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const agentPath = join(this.agentsPath, entry.name);
      const configPath = join(agentPath, "agent.json");

      try {
        const content = await readFile(configPath, "utf-8");
        const rawJson = JSON.parse(content);
        const config = AgentConfigSchema.parse(rawJson);
        configs.push(config);
        logger.debug(`Discovered valid agent config for '${config.id}' from '${configPath}'`);
      } catch (error) {
        logger.warn(
          `Skipping agent directory '${entry.name}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.discoveredConfigs = configs;
    return configs;
  }

  getDiscoveredConfigs(): AgentConfig[] {
    return this.discoveredConfigs;
  }

  async loadAll(): Promise<AgentCapability[]> {
    const configs =
      this.discoveredConfigs.length > 0 ? this.discoveredConfigs : await this.loadAgentConfigs();

    const capabilities: AgentCapability[] = configs.map((config) => {
      const rawAgentId = config.id.startsWith("agent.") ? config.id.slice(6) : config.id;
      const capabilityId = `agent.${rawAgentId}`;

      return {
        id: capabilityId,
        name: config.name,
        description: config.description ?? `Agent ${config.name}`,
        type: "agent",
        agentId: rawAgentId,
      };
    });

    logger.info(`Loaded ${capabilities.length} agent capability(ies) from '${this.agentsPath}'`);
    return capabilities;
  }
}
