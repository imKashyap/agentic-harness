import { Tool, ToolContext, ToolResult } from "../../capabilities/tools/tool.js";
import { createLogger } from "../../utils/logger.js";
import { MemoryManager } from "../long-term/memory-manager.js";

const logger = createLogger("MemoryTools");

export class RememberFactTool implements Tool {
  public readonly id = "tool.remember_fact";
  public readonly name = "Remember Fact";
  public readonly description =
    "Saves an important fact, user preference, or insight into long-term memory for future recall.";
  public readonly type = "tool" as const;
  public readonly metadata = {};

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

  constructor(private readonly memoryManager: MemoryManager) {}

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

    try {
      const entry = await this.memoryManager.remember(fact.trim(), {
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

export class SearchMemoryTool implements Tool {
  public readonly id = "tool.search_memory";
  public readonly name = "Search Memory";
  public readonly description =
    "Searches long-term memory for relevant facts, prior discussions, or user preferences.";
  public readonly type = "tool" as const;
  public readonly metadata = {};

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

  constructor(private readonly memoryManager: MemoryManager) {}

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

    try {
      const results = await this.memoryManager.recall(query.trim(), {
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
