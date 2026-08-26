import { MemoryEntry, MemorySearchOptions, MemorySearchResult } from "../types.js";

export interface LongTermMemoryStore {
  save(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry>;
  search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
  delete(id: string): Promise<boolean>;
  list(agentId?: string): Promise<MemoryEntry[]>;
  clear?(): Promise<void>;
}
