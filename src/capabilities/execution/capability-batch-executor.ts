import { ExecutionContext } from "../../core/execution/execution-context.js";
import { createLogger } from "../../utils/logger.js";
import {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityExecutor,
} from "./capability-executor.js";

const logger = createLogger("CapabilityBatchExecutor");

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
    logger.info(`Executing batch of ${requests.length} capability request(s)`);

    const results = await Promise.all(
      requests.map(async (request) => {
        logger.debug(`Executing batch request for: ${request.name}`);
        const result = await this.capabilityExecutor.execute(request, context);

        return {
          request,
          result,
        };
      }),
    );

    logger.info(`Batch capability execution completed (${results.length} results)`);
    return results;
  }
}
