import { MemoryEntry, MemorySearchOptions, MemorySearchResult, NewMemoryEntry } from "../types.js";

export interface LongTermMemoryStore {
  save(entry: NewMemoryEntry): Promise<MemoryEntry>;
  search(query: string, options: MemorySearchOptions): Promise<MemorySearchResult[]>;
  delete(id: string, principalId: string): Promise<boolean>;
  list(
    options: Pick<MemorySearchOptions, "principalId" | "scope" | "agentId">,
  ): Promise<MemoryEntry[]>;
  clear?(): Promise<void>;
}
