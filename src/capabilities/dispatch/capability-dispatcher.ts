import { inject, injectable } from "inversify";

import { ExecutionContext } from "../../core/execution/execution-context.js";
import { TYPES } from "../../di/types.js";
import {
  CapabilityAccessDeniedError,
  CapabilityTypeError,
} from "../../errors/capability-errors.js";
import { createLogger } from "../../utils/logger.js";
import { CapabilityRegistry } from "../capability-registry.js";
import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "./capability-executor.js";

const logger = createLogger("CapabilityDispatcher");

@injectable()
export class CapabilityDispatcher implements CapabilityExecutor {
  constructor(
    @inject(TYPES.CapabilityRegistry) private readonly registry: CapabilityRegistry,
    @inject(TYPES.ToolCapabilityExecutor) private readonly toolExecutor: CapabilityExecutor,
    @inject(TYPES.SubAgentExecutor) private readonly subAgentExecutor: CapabilityExecutor,
  ) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
  ): Promise<CapabilityExecutionResult> {
    logger.debug(`Dispatching capability execution: '${request.name}'`);
    if (!context.allowedCapabilities?.includes(request.name)) {
      throw new CapabilityAccessDeniedError(request.name, context.agentId);
    }
    const capability = this.registry.get(request.name);

    switch (capability.type) {
      case "tool":
        logger.debug(`Routing '${request.name}' to ToolExecutor`);
        return this.toolExecutor.execute(request, context, capability);

      case "agent":
        logger.debug(`Routing '${request.name}' to SubAgentExecutor`);
        return this.subAgentExecutor.execute(request, context, capability);

      case "skill":
        logger.error(`Skill execution requested but not supported directly: '${request.name}'`);
        throw new CapabilityTypeError(request.name, "tool or agent", "skill");

      default:
        logger.error(
          `Unsupported capability type for '${request.name}': ${(capability as { type: string }).type}`,
        );
        throw new CapabilityTypeError(
          request.name,
          "executable capability",
          (capability as { type: string }).type,
        );
    }
  }
}
