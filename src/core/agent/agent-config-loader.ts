import { readFile } from "node:fs/promises";

import { AgentConfig, AgentConfigSchema } from "./agent-config.js";

export class AgentConfigLoader {
  async load(path: string): Promise<AgentConfig> {
    const content = await readFile(path, "utf-8");

    const rawConfig: unknown = JSON.parse(content);

    return AgentConfigSchema.parse(rawConfig);
  }
}
