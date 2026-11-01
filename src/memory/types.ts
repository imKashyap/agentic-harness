import { Message } from "../llm/types.js";

export interface Session {
  id: string;
  agentId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryEntry {
  id: string;
  /** Owner boundary. Legacy rows without an owner remain inaccessible to scoped reads. */
  principalId?: string;
  scope?: MemoryScope;
  /** Agent that created the memory; provenance only for user-scoped memory. */
  agentId?: string;
  sessionId?: string;
  content: string;
  tags?: string[];
  embedding?: number[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type MemoryScope = "user" | "agent";

export interface MemoryWriteOptions {
  principalId: string;
  scope?: MemoryScope;
  agentId?: string;
  sessionId?: string;
  tags?: string[];
}

export type NewMemoryEntry = Omit<MemoryEntry, "id" | "createdAt" | "principalId" | "scope"> &
  MemoryWriteOptions;

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface MemorySearchOptions {
  principalId: string;
  scope?: MemoryScope;
  /** Required for agent-private scope; ignored for user scope. */
  agentId?: string;
  sessionId?: string;
  tags?: string[];
  limit?: number;
  minScore?: number;
}

export interface SessionRunOptions {
  sessionId?: string;
  persistSession?: boolean;
  enableLongTermMemory?: boolean;
  maxContextMessages?: number;
}
