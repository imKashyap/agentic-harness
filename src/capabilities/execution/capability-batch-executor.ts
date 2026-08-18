import { ExecutionContext } from "../../core/execution/execution-context.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "./capability-executor.js";

export interface CapabilityBatchResult {
  request: CapabilityExecutionRequest;
  result: CapabilityExecutionResult;
}

export class CapabilityBatchExecutor {
  constructor(private readonly capabilityExecutor: CapabilityExecutor) {}

  async execute(
    requests: CapabilityExecutionRequest[],
    context: ExecutionContext,
  ): Promise<CapabilityBatchResult[]> {
    const results = await Promise.all(
      requests.map(async (request) => {
        const result = await this.capabilityExecutor.execute(request, context);

        return {
          request,
          result,
        };
      }),
    );

    return results;
  }
}
