import { AgentRegistry } from "../../core/agent/agent-registry.js";
import { ExecutionContext } from "../../core/execution/execution-context.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "../execution/capability-executor.js";
import { AgentCapability } from "./agent-capability.js";

interface DelegationInput {
  task: string;
}

export class SubAgentExecutor implements CapabilityExecutor {
  constructor(private readonly agentRegistry: AgentRegistry) {}

  async execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
    capability?: AgentCapability,
  ): Promise<CapabilityExecutionResult> {
    if (!capability) {
      throw new Error(`Agent capability is required for sub-agent execution: ${request.name}`);
    }

    const input = request.input as DelegationInput;

    if (!input || typeof input.task !== "string" || input.task.trim().length === 0) {
      return {
        success: false,
        output: null,
        error: "Sub-agent delegation requires a non-empty task",
      };
    }

    const agent = this.agentRegistry.get(capability.agentId);

    const result = await agent.run(
      {
        message: input.task,
      },
      context,
    );

    return {
      success: true,
      output: {
        agentId: capability.agentId,
        response: result.response,
      },
    };
  }
}
