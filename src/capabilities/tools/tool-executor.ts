import { Tool, ToolContext, ToolResult } from "./tool.js";

export class ToolExecutor {
  async execute(tool: Tool, input: unknown, context: ToolContext): Promise<ToolResult> {
    return tool.execute(input, context);
  }
}
