import { readFile } from "node:fs/promises";

import { createLogger } from "../../utils/logger.js";
import { AgentConfig, AgentConfigSchema } from "./agent-config.js";

const logger = createLogger("AgentConfigLoader");

export class AgentConfigLoader {
  async load(path: string): Promise<AgentConfig> {
    logger.debug(`Loading agent config from: ${path}`);

    let content: string;
    try {
      content = await readFile(path, "utf-8");
    } catch (error) {
      const message = `Failed to read agent config file at '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message);
      throw new Error(message);
    }

    let rawConfig: unknown;
    try {
      rawConfig = JSON.parse(content);
    } catch (error) {
      const message = `Invalid JSON in agent config file at '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message);
      throw new Error(message);
    }

    try {
      const config = AgentConfigSchema.parse(rawConfig);
      logger.info(
        `Successfully loaded agent config for '${config.id}' (model: ${config.model.model})`,
      );
      return config;
    } catch (error) {
      const message = `Schema validation failed for agent config at '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message);
      throw new Error(message);
    }
  }
}
