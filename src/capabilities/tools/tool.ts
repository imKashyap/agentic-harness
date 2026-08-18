import { ExecutionContext } from "../../core/execution/execution-context.js";
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

  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
