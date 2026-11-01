import { inject, injectable } from "inversify";

import { TYPES } from "../../../../di/types.js";
import { MemoryManager } from "../../../../memory/long-term/memory-manager.js";
import { createLogger } from "../../../../utils/logger.js";
import { Tool, ToolContext, ToolResult } from "../../tool.js";

const logger = createLogger("RememberFactTool");

@injectable()
export class RememberFactTool implements Tool {
  public readonly id = "tool.remember_fact";
  public readonly name = "Remember Fact";
  public readonly description =
    "Saves a durable user fact or preference in long-term memory when the agent has permission.";
  public readonly type = "tool" as const;
  public readonly metadata = {};
  public readonly progressMessage = "Saving insight to long-term memory...";

  public readonly inputSchema = {
    type: "object",
    properties: {
      fact: {
        type: "string",
        description: "The fact, guideline, or preference to remember",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags to categorize this memory (e.g. ['preference', 'tech-stack'])",
      },
    },
    required: ["fact"],
  };

  constructor(
    @inject(TYPES.MemoryManager)
    private readonly memoryManager: MemoryManager,
  ) {}

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    if (!input || typeof input !== "object") {
      return {
        success: false,
        output: null,
        error: "Input must be an object with a 'fact' property",
      };
    }

    const { fact, tags } = input as { fact?: string; tags?: string[] };
    if (!fact || typeof fact !== "string" || fact.trim().length === 0) {
      return { success: false, output: null, error: "Fact must be a non-empty string" };
    }

    if (!context.principalId) {
      return {
        success: false,
        output: null,
        error: "Saving memory requires an authenticated principal context",
      };
    }

    try {
      const entry = await this.memoryManager.remember(fact.trim(), {
        principalId: context.principalId,
        scope: context.memoryScope ?? "user",
        agentId: context.agentId,
        tags: Array.isArray(tags) ? tags : undefined,
      });

      logger.info(`Agent '${context.agentId}' remembered fact [${entry.id}]`);
      return {
        success: true,
        output: {
          message: "Fact saved to long-term memory successfully",
          id: entry.id,
          fact: entry.content,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: null, error: `Failed to save memory: ${msg}` };
    }
  }
}
