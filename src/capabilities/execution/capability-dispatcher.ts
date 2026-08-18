import { ExecutionContext } from "../../core/execution/execution-context.js";
import { CapabilityRegistry } from "../capability-registry.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "./capability-executor.js";

export class CapabilityDispatcher implements CapabilityExecutor {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly toolExecutor: CapabilityExecutor,
    private readonly subAgentExecutor: CapabilityExecutor,
  ) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
  ): Promise<CapabilityExecutionResult> {
    const capability = this.registry.get(request.name);

    switch (capability.type) {
      case "tool":
        return this.toolExecutor.execute(request, context, capability);

      case "agent":
        return this.subAgentExecutor.execute(request, context, capability);

      case "skill":
        throw new Error(`Skill execution is not supported yet: ${request.name}`);

      default:
        throw new Error(`Unsupported capability type: ${capability.type}`);
    }
  }
}
