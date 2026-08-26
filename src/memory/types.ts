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
  agentId?: string;
  sessionId?: string;
  content: string;
  tags?: string[];
  embedding?: number[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface MemorySearchOptions {
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
