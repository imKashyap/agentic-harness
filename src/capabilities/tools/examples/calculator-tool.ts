import { Tool, ToolContext, ToolResult } from "../tool.js";

interface CalculatorInput {
  expression: string;
}

export class CalculatorTool implements Tool {
  readonly id = "tool.calculator";

  readonly name = "Calculator";

  readonly description = "Evaluates a basic mathematical expression.";

  readonly type = "tool" as const;

  readonly metadata = {};

  readonly inputSchema = {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate",
      },
    },
    required: ["expression"],
  };

  async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
    const { expression } = input as CalculatorInput;

    try {
      const result = Function(`"use strict"; return (${expression})`)();

      return {
        success: true,
        output: result,
      };
    } catch {
      return {
        success: false,
        output: null,
        error: "Invalid mathematical expression",
      };
    }
  }
}
