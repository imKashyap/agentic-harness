import { ExecutionContext } from "../../core/execution/execution-context.js";
import { createLogger } from "../../utils/logger.js";
import { CapabilityRegistry } from "../capability-registry.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "../execution/capability-executor.js";
import { ToolExecutor } from "./tool-executor.js";

const logger = createLogger("ToolCallExecutor");

export class ToolCallExecutor implements CapabilityExecutor {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
  ): Promise<CapabilityExecutionResult> {
    logger.debug(`Executing tool call request: '${request.name}'`);

    let input = request.input;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        // retain string input
      }
    }

    try {
      const tool = this.registry.getTool(request.name);
      const result = await this.toolExecutor.execute(tool, input, context);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool execution failed for '${request.name}': ${errorMessage}`);
      return {
        success: false,
        output: null,
        error: errorMessage,
      };
    }
  }
}
