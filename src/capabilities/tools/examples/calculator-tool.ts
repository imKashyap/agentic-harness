import { createLogger } from "../../../utils/logger.js";
import { Tool, ToolContext, ToolResult } from "../tool.js";

const logger = createLogger("CalculatorTool");

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
    logger.debug(`Executing calculator with input: ${JSON.stringify(input)}`);

    if (!input || typeof input !== "object") {
      logger.warn("CalculatorTool received non-object input");
      return {
        success: false,
        output: null,
        error: "Input must be an object with an 'expression' string property",
      };
    }

    const { expression } = input as Partial<CalculatorInput>;

    if (typeof expression !== "string" || expression.trim().length === 0) {
      logger.warn("CalculatorTool received missing or non-string expression");
      return {
        success: false,
        output: null,
        error: "Expression is required and must be a non-empty string",
      };
    }

    const trimmed = expression.trim();
    if (!/^[\d\s+\-*/().%^,eE]+$/.test(trimmed)) {
      logger.warn(`CalculatorTool rejected unsafe characters in expression: ${trimmed}`);
      return {
        success: false,
        output: null,
        error:
          "Expression contains invalid characters. Only numbers and basic math operators (+, -, *, /, %, ^, parentheses) are allowed.",
      };
    }

    try {
      const sanitized = trimmed.replace(/\^/g, "**");
      const result = Function(`"use strict"; return (${sanitized})`)();

      if (typeof result !== "number" || !Number.isFinite(result)) {
        logger.warn(`Calculation evaluated to non-finite result: ${String(result)}`);
        return {
          success: false,
          output: null,
          error: `Calculation resulted in ${String(result)}`,
        };
      }

      logger.info(`Calculator evaluated '${expression}' = ${result}`);
      return {
        success: true,
        output: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Calculation failed for '${expression}': ${errorMessage}`);
      return {
        success: false,
        output: null,
        error: `Invalid mathematical expression: ${errorMessage}`,
      };
    }
  }
}
