import { ExecutionContext } from "../../core/execution/execution-context.js";
import { RetryPolicy } from "../../resilience/types.js";
import { Capability } from "../capability.js";

export type ToolContext = ExecutionContext;

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
}

export interface Tool extends Capability {
  type: "tool";

  inputSchema: Record<string, unknown>;

  outputSchema?: Record<string, unknown>;

  requiresApproval?: boolean | ((input: unknown, context: ToolContext) => boolean);

  progressMessage?: string | ((input: unknown) => string);

  timeoutMs?: number;

  retryPolicy?: Partial<RetryPolicy>;

  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
