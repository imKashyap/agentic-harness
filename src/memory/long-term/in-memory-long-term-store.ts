import { injectable, unmanaged } from "inversify";

import { createLogger } from "../../utils/logger.js";
import { MemoryEntry, MemorySearchOptions, MemorySearchResult } from "../types.js";
import { cosineSimilarity } from "./cosine-similarity.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { LocalHashEmbeddingProvider } from "./embeddings.js";
import type { LongTermMemoryStore } from "./memory-store.js";

const logger = createLogger("InMemoryLongTermStore");

@injectable()
export class InMemoryLongTermStore implements LongTermMemoryStore {
  private readonly memories = new Map<string, MemoryEntry>();
  private readonly embeddingProvider: EmbeddingProvider;

  constructor(@unmanaged() embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider ?? new LocalHashEmbeddingProvider();
  }

  async save(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    const id = crypto.randomUUID();
    let embedding = entry.embedding;

    if (!embedding) {
      embedding = await this.embeddingProvider.embed(entry.content);
    }

    const memory: MemoryEntry = {
      id,
      ...entry,
      embedding,
      createdAt: Date.now(),
    };

    this.memories.set(id, memory);
    logger.info(
      `Saved long-term memory [${id}] (agent: ${entry.agentId ?? "global"}, length: ${entry.content.length})`,
    );

    return memory;
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    if (this.memories.size === 0) {
      return [];
    }

    const queryEmbedding = await this.embeddingProvider.embed(query);
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.1;

    const allEntries = Array.from(this.memories.values());

    const filtered = allEntries.filter((entry) => {
      if (options.agentId && entry.agentId && entry.agentId !== options.agentId) {
        return false;
      }
      if (options.sessionId && entry.sessionId && entry.sessionId !== options.sessionId) {
        return false;
      }
      if (options.tags && options.tags.length > 0) {
        const entryTags = new Set(entry.tags ?? []);
        const hasTag = options.tags.some((tag) => entryTags.has(tag));
        if (!hasTag) {
          return false;
        }
      }
      return true;
    });

    const results: MemorySearchResult[] = [];

    for (const entry of filtered) {
      let score = 0;
      if (entry.embedding && entry.embedding.length > 0) {
        score = cosineSimilarity(queryEmbedding, entry.embedding);
      }

      // Keyword boost if query terms appear in content
      const queryLower = query.toLowerCase();
      const contentLower = entry.content.toLowerCase();
      if (contentLower.includes(queryLower)) {
        score = Math.min(1.0, score + 0.2);
      }

      if (score >= minScore) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    logger.debug(
      `Memory search for "${query.slice(0, 40)}" yielded ${topResults.length} relevant memories (total searched: ${filtered.length})`,
    );

    return topResults;
  }

  async delete(id: string): Promise<boolean> {
    logger.debug(`Deleting memory [${id}]`);
    return this.memories.delete(id);
  }

  async list(agentId?: string): Promise<MemoryEntry[]> {
    const all = Array.from(this.memories.values());
    if (!agentId) {
      return all;
    }
    return all.filter((m) => !m.agentId || m.agentId === agentId);
  }

  async clear(): Promise<void> {
    this.memories.clear();
  }
}
