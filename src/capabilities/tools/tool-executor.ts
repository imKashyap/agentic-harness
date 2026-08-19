import { createLogger } from "../../utils/logger.js";
import { Tool, ToolContext, ToolResult } from "./tool.js";

const logger = createLogger("ToolExecutor");

export class ToolExecutor {
  async execute(tool: Tool, input: unknown, context: ToolContext): Promise<ToolResult> {
    logger.debug(`Executing tool '${tool.id}' (runId: ${context.runId})`);
    const startTime = Date.now();
    try {
      const result = await tool.execute(input, context);
      const durationMs = Date.now() - startTime;
      logger.info(
        `Tool '${tool.id}' executed in ${durationMs}ms (success: ${result.success}${
          result.error ? `, error: ${result.error}` : ""
        })`,
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool '${tool.id}' threw unhandled error in ${durationMs}ms: ${errorMessage}`);
      return {
        success: false,
        output: null,
        error: errorMessage,
      };
    }
  }
}
