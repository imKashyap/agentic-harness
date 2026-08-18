import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { CapabilityLoader } from "../capability-loader.js";
import { AgentCapability } from "./agent-capability.js";

interface AgentMetadata {
  id: string;
  name: string;
  description?: string;
}

export class AgentCapabilityLoader implements CapabilityLoader {
  constructor(private readonly agentsPath: string) {}

  async loadAll(): Promise<AgentCapability[]> {
    const entries = await readdir(this.agentsPath, { withFileTypes: true });

    const capabilities: AgentCapability[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const agentPath = join(this.agentsPath, entry.name);

      const configPath = join(agentPath, "agent.json");

      const content = await readFile(configPath, "utf-8");

      const metadata = JSON.parse(content) as AgentMetadata;

      capabilities.push({
        id: `agent.${metadata.id}`,
        name: metadata.name,
        description: metadata.description ?? `Agent ${metadata.name}`,
        type: "agent",
        agentId: metadata.id,
      });
    }

    return capabilities;
  }
}
