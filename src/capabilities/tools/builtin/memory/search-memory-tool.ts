import { inject, injectable } from "inversify";

import { TYPES } from "../../../../di/types.js";
import { MemoryManager } from "../../../../memory/long-term/memory-manager.js";
import { Tool, ToolContext, ToolResult } from "../../tool.js";

@injectable()
export class SearchMemoryTool implements Tool {
  public readonly id = "tool.search_memory";
  public readonly name = "Search Memory";
  public readonly description =
    "Searches long-term memory for relevant facts, prior discussions, or user preferences.";
  public readonly type = "tool" as const;
  public readonly metadata = {};
  public readonly progressMessage = "Searching long-term memory...";

  public readonly inputSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query or keywords to look up in memory",
      },
      limit: {
        type: "number",
        description: "Maximum number of memories to return (default: 5)",
      },
    },
    required: ["query"],
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
        error: "Input must be an object with a 'query' property",
      };
    }

    const { query, limit } = input as { query?: string; limit?: number };
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return { success: false, output: null, error: "Query must be a non-empty string" };
    }

    if (!context.principalId) {
      return {
        success: false,
        output: null,
        error: "Searching memory requires an authenticated principal context",
      };
    }

    try {
      const results = await this.memoryManager.recall(query.trim(), {
        principalId: context.principalId,
        scope: context.memoryScope ?? "user",
        agentId: context.agentId,
        limit: typeof limit === "number" ? limit : 5,
      });

      return {
        success: true,
        output: {
          query,
          matchCount: results.length,
          memories: results.map((r) => ({
            content: r.entry.content,
            score: Math.round(r.score * 100) / 100,
            tags: r.entry.tags,
          })),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: null, error: `Failed to search memory: ${msg}` };
    }
  }
}
