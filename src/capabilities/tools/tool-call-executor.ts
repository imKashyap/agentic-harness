import { ExecutionContext } from "../../core/execution/execution-context.js";
import { CapabilityRegistry } from "../capability-registry.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "../execution/capability-executor.js";
import { ToolExecutor } from "./tool-executor.js";

export class ToolCallExecutor implements CapabilityExecutor {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
  ): Promise<CapabilityExecutionResult> {
    const tool = this.registry.getTool(request.name);

    const result = await this.toolExecutor.execute(tool, request.input, context);

    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }
}
