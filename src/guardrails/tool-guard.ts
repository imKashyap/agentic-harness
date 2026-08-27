import { injectable } from "inversify";

import { Tool, ToolContext } from "../capabilities/tools/tool.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("ToolGuard");

export interface ToolGuardEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

@injectable()
export class ToolGuard {
  public evaluate(tool: Tool, input: unknown, context: ToolContext): ToolGuardEvaluation {
    let requiresApproval = false;

    if (typeof tool.requiresApproval === "function") {
      requiresApproval = Boolean(tool.requiresApproval(input, context));
    } else if (typeof tool.requiresApproval === "boolean") {
      requiresApproval = tool.requiresApproval;
    }

    if (requiresApproval) {
      logger.info(`Tool '${tool.id}' flagged for human approval`);
      return {
        allowed: true,
        requiresApproval: true,
        reason: `Tool '${tool.id}' requires human approval`,
      };
    }

    return { allowed: true, requiresApproval: false };
  }
}
