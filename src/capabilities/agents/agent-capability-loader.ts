import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createLogger } from "../../utils/logger.js";
import { CapabilityLoader } from "../capability-loader.js";
import { AgentCapability } from "./agent-capability.js";

const logger = createLogger("AgentCapabilityLoader");

interface AgentMetadata {
  id: string;
  name: string;
  description?: string;
}

export class AgentCapabilityLoader implements CapabilityLoader {
  constructor(private readonly agentsPath: string) {}

  async loadAll(): Promise<AgentCapability[]> {
    logger.debug(`Scanning for agent capabilities in: ${this.agentsPath}`);

    let entries;
    try {
      entries = await readdir(this.agentsPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `Agents directory not accessible at '${this.agentsPath}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }

    const capabilities: AgentCapability[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const agentPath = join(this.agentsPath, entry.name);
      const configPath = join(agentPath, "agent.json");

      try {
        const content = await readFile(configPath, "utf-8");
        const metadata = JSON.parse(content) as AgentMetadata;

        const rawAgentId = metadata.id.startsWith("agent.") ? metadata.id.slice(6) : metadata.id;
        const capabilityId = `agent.${rawAgentId}`;

        capabilities.push({
          id: capabilityId,
          name: metadata.name,
          description: metadata.description ?? `Agent ${metadata.name}`,
          type: "agent",
          agentId: rawAgentId,
        });

        logger.debug(`Loaded agent capability '${capabilityId}' (agentId: ${rawAgentId})`);
      } catch (error) {
        logger.warn(
          `Skipping agent directory '${entry.name}' due to error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    logger.info(`Loaded ${capabilities.length} agent capability(ies) from '${this.agentsPath}'`);
    return capabilities;
  }
}
