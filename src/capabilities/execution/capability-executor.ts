import { ExecutionContext } from "../../core/execution/execution-context.js";

export interface CapabilityExecutionRequest {
  name: string;
  input: unknown;
}

export interface CapabilityExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
}

export interface CapabilityExecutor {
  execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
  ): Promise<CapabilityExecutionResult>;
}
