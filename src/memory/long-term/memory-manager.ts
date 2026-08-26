import { createLogger } from "../../utils/logger.js";
import { MemoryEntry, MemorySearchOptions, MemorySearchResult } from "../types.js";
import { InMemoryLongTermStore } from "./in-memory-long-term-store.js";
import { LongTermMemoryStore } from "./memory-store.js";

const logger = createLogger("MemoryManager");

export class MemoryManager {
  constructor(private readonly store: LongTermMemoryStore = new InMemoryLongTermStore()) {}

  async remember(
    content: string,
    options: { agentId?: string; sessionId?: string; tags?: string[] } = {},
  ): Promise<MemoryEntry> {
    logger.info(
      `Remembering fact for agent '${options.agentId ?? "global"}': "${content.slice(0, 50)}..."`,
    );
    return this.store.save({
      content,
      agentId: options.agentId,
      sessionId: options.sessionId,
      tags: options.tags,
    });
  }

  async recall(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    return this.store.search(query, options);
  }

  formatMemoryPrompt(results: MemorySearchResult[]): string {
    if (!results || results.length === 0) {
      return "";
    }

    const lines: string[] = ["\n\n## Relevant Long-Term Memory & Prior Context"];

    for (const result of results) {
      const entry = result.entry;
      const tagsStr = entry.tags && entry.tags.length > 0 ? ` [${entry.tags.join(", ")}]` : "";
      lines.push(`- ${entry.content}${tagsStr}`);
    }

    return lines.join("\n");
  }

  getStore(): LongTermMemoryStore {
    return this.store;
  }
}
