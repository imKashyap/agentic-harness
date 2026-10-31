import { inject, injectable } from "inversify";

import { AgentRegistry } from "../../core/agent/agent-registry.js";
import { ExecutionContext } from "../../core/execution/execution-context.js";
import { TYPES } from "../../di/types.js";
import { createLogger } from "../../utils/logger.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
  resolveCapabilityStringField,
} from "../dispatch/capability-executor.js";
import { AgentCapability } from "./agent-capability.js";

const logger = createLogger("SubAgentExecutor");

@injectable()
export class SubAgentExecutor implements CapabilityExecutor {
  constructor(@inject(TYPES.AgentRegistry) private readonly agentRegistry: AgentRegistry) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
    capability?: AgentCapability,
  ): Promise<CapabilityExecutionResult> {
    const rawAgentId = capability?.agentId ?? request.name.replace(/^agent\./, "");
    logger.info(`Delegating task to sub-agent '${rawAgentId}' (runId: ${context.runId})`);

    const task = resolveCapabilityStringField(request.input, "task", "message");

    if (!task || task.trim().length === 0) {
      logger.warn(`Sub-agent delegation to '${rawAgentId}' rejected: empty task`);
      return {
        success: false,
        output: null,
        error: "Sub-agent delegation requires a non-empty task",
      };
    }

    try {
      const agent = this.agentRegistry.get(rawAgentId);
      const startTime = Date.now();

      const result = await agent.run(
        {
          message: task,
        },
        context,
      );

      const durationMs = Date.now() - startTime;
      logger.info(`Sub-agent '${rawAgentId}' completed delegation in ${durationMs}ms`);

      return {
        success: true,
        output: {
          agentId: rawAgentId,
          response: result.response,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Sub-agent '${rawAgentId}' delegation failed: ${errorMessage}`);
      return {
        success: false,
        output: null,
        error: errorMessage,
      };
    }
  }
}
