import { ToolCall } from "../../llm/model.js";
import { ExecutionContext } from "../../core/execution/execution-context.js";
import { CapabilityRegistry } from "../capability-registry.js";
import { ToolExecutor } from "./tool-executor.js";

export class ToolCallExecutor {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  async execute(toolCall: ToolCall, context: ExecutionContext) {
    const tool = this.registry.getTool(toolCall.name);

    return this.toolExecutor.execute(tool, toolCall.arguments, context);
  }
}
