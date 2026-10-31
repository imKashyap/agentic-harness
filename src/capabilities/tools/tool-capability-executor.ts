import { inject, injectable } from "inversify";

import { ExecutionContext } from "../../core/execution/execution-context.js";
import { TYPES } from "../../di/types.js";
import { createLogger } from "../../utils/logger.js";
import { Capability } from "../capability.js";
import { CapabilityRegistry } from "../capability-registry.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
  normalizeCapabilityInput,
} from "../dispatch/capability-executor.js";
import { ToolExecutor } from "./tool-executor.js";

const logger = createLogger("ToolCapabilityExecutor");

@injectable()
export class ToolCapabilityExecutor implements CapabilityExecutor {
  constructor(
    @inject(TYPES.CapabilityRegistry) private readonly registry: CapabilityRegistry,
    @inject(TYPES.ToolExecutor) private readonly toolExecutor: ToolExecutor,
  ) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
    _capability?: Capability,
  ): Promise<CapabilityExecutionResult> {
    logger.debug(`Executing tool capability request: '${request.name}'`);

    const input = normalizeCapabilityInput(request.input);

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
