import { apiFetch } from './client';

export interface MessageItem {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: unknown;
  }>;
  toolCallId?: string;
  name?: string;
}

export interface SessionSummary {
  id: string;
  agentId: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionDetail {
  id: string;
  agentId: string;
  messages: MessageItem[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export async function getSessions(agentId?: string): Promise<{ success: boolean; sessions: SessionSummary[] }> {
  const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
  return apiFetch<{ success: boolean; sessions: SessionSummary[] }>(`/sessions${query}`);
}

export async function getSession(id: string): Promise<{ success: boolean; session: SessionDetail }> {
  return apiFetch<{ success: boolean; session: SessionDetail }>(`/sessions/${id}`);
}

export async function deleteSession(id: string): Promise<{ success: boolean; deleted: boolean }> {
  return apiFetch<{ success: boolean; deleted: boolean }>(`/sessions/${id}`, {
    method: 'DELETE',
  });
}
