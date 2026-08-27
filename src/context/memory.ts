import { inject, injectable, unmanaged } from "inversify";

import { TYPES } from "../di/types.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("Memory");

export interface MemoryEntry {
  id: string;
  agentId: string;
  content: string;
  embedding?: number[];
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface LongTermMemoryStore {
  save(entry: MemoryEntry): Promise<void>;
  search(
    queryEmbedding: number[],
    options?: { limit?: number; minScore?: number; agentId?: string },
  ): Promise<MemorySearchResult[]>;
  list(agentId?: string): Promise<MemoryEntry[]>;
  delete(id: string): Promise<boolean>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

@injectable()
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  private dimensions: number;

  constructor(@unmanaged() dimensions: number = 64) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimensions).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      let hash = 0;
      for (let j = 0; j < token.length; j++) {
        hash = (hash << 5) - hash + token.charCodeAt(j);
        hash |= 0;
      }
      const index = Math.abs(hash) % this.dimensions;
      vector[index] += 1 / Math.sqrt(i + 1);
    }

    let sumSq = 0;
    for (const val of vector) sumSq += val * val;
    const norm = Math.sqrt(sumSq) || 1;
    return vector.map((v) => v / norm);
  }
}

@injectable()
export class InMemoryLongTermStore implements LongTermMemoryStore {
  private entries = new Map<string, MemoryEntry>();

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, { ...entry });
  }

  async search(
    queryEmbedding: number[],
    options?: { limit?: number; minScore?: number; agentId?: string },
  ): Promise<MemorySearchResult[]> {
    const limit = options?.limit ?? 5;
    const minScore = options?.minScore ?? 0.0;
    const results: MemorySearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (options?.agentId && entry.agentId !== options.agentId) continue;
      if (!entry.embedding) continue;

      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      if (score >= minScore) {
        results.push({ entry: { ...entry }, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async list(agentId?: string): Promise<MemoryEntry[]> {
    const all = Array.from(this.entries.values());
    if (agentId) return all.filter((e) => e.agentId === agentId);
    return all;
  }

  async delete(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }
}

@injectable()
export class MemoryManager {
  private embeddingProvider: EmbeddingProvider;

  constructor(
    @inject(TYPES.LongTermMemoryStore) private store: LongTermMemoryStore,
    @unmanaged() embeddingProvider?: EmbeddingProvider,
  ) {
    this.embeddingProvider = embeddingProvider ?? new LocalHashEmbeddingProvider();
  }

  async remember(
    content: string,
    options?: { agentId?: string; tags?: string[]; metadata?: Record<string, unknown> },
  ): Promise<MemoryEntry> {
    const embedding = await this.embeddingProvider.embed(content);
    const id = crypto.randomUUID();
    const entry: MemoryEntry = {
      id,
      agentId: options?.agentId || "global",
      content,
      embedding,
      tags: options?.tags || [],
      metadata: options?.metadata,
      createdAt: Date.now(),
    };

    logger.info(`Remembering fact for agent '${entry.agentId}': "${content.slice(0, 50)}..."`);
    await this.store.save(entry);
    return entry;
  }

  async recall(
    query: string,
    options?: { agentId?: string; limit?: number; minScore?: number },
  ): Promise<MemorySearchResult[]> {
    const queryEmbedding = await this.embeddingProvider.embed(query);
    return this.store.search(queryEmbedding, options);
  }

  async search(query: string, agentId?: string, limit?: number): Promise<MemorySearchResult[]> {
    return this.recall(query, { agentId, limit });
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
}
