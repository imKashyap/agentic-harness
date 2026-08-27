import { Message } from "../../llm/types.js";

export interface Session {
  id: string;
  agentId?: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationState {
  sessionId: string;
  messages: Message[];
  metadata: Record<string, unknown>;
}
