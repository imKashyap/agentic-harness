import { createLogger } from "../../utils/logger.js";
import { CapabilityLoader } from "../capability-loader.js";
import { Tool } from "./tool.js";

const logger = createLogger("ToolLoader");

export class ToolLoader implements CapabilityLoader {
  constructor(private readonly tools: Tool[] = []) {}

  async loadAll(): Promise<Tool[]> {
    logger.info(`Loading ${this.tools.length} tool(s)`);
    for (const tool of this.tools) {
      logger.debug(`Loaded tool '${tool.id}' (${tool.name})`);
    }
    return this.tools;
  }
}
