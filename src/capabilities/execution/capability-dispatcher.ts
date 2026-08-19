import { ExecutionContext } from "../../core/execution/execution-context.js";
import { createLogger } from "../../utils/logger.js";
import { CapabilityRegistry } from "../capability-registry.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "./capability-executor.js";

const logger = createLogger("CapabilityDispatcher");

export class CapabilityDispatcher implements CapabilityExecutor {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly toolCallExecutor: CapabilityExecutor,
    private readonly subAgentExecutor: CapabilityExecutor,
  ) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
  ): Promise<CapabilityExecutionResult> {
    logger.debug(`Dispatching capability execution: '${request.name}'`);
    const capability = this.registry.get(request.name);

    switch (capability.type) {
      case "tool":
        logger.debug(`Routing '${request.name}' to ToolExecutor`);
        return this.toolCallExecutor.execute(request, context, capability);

      case "agent":
        logger.debug(`Routing '${request.name}' to SubAgentExecutor`);
        return this.subAgentExecutor.execute(request, context, capability);

      case "skill":
        logger.error(`Skill execution requested but not supported yet: '${request.name}'`);
        throw new Error(`Skill execution is not supported yet: ${request.name}`);

      default:
        logger.error(
          `Unsupported capability type for '${request.name}': ${(capability as { type: string }).type}`,
        );
        throw new Error(`Unsupported capability type: ${(capability as { type: string }).type}`);
    }
  }
}
