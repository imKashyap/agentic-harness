import { injectable } from "inversify";

import { withRetry, withTimeout } from "../../resilience/index.js";
import { createLogger } from "../../utils/logger.js";
import { Tool, ToolContext, ToolResult } from "./tool.js";

const logger = createLogger("ToolExecutor");

export const DEFAULT_TOOL_TIMEOUT_MS = 30000;

@injectable()
export class ToolExecutor {
  async execute(tool: Tool, input: unknown, context: ToolContext): Promise<ToolResult> {
    logger.debug(`Executing tool '${tool.id}' (runId: ${context.runId})`);
    const startTime = Date.now();
    const timeoutMs = tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

    try {
      const executeFn = async () => {
        return withTimeout(
          async () => {
            return tool.execute(input, context);
          },
          timeoutMs,
          `Tool execution [${tool.id}]`,
        );
      };

      let result: ToolResult;
      if (tool.retryPolicy) {
        result = await withRetry(executeFn, tool.retryPolicy, `Tool execution [${tool.id}]`);
      } else {
        result = await executeFn();
      }

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
