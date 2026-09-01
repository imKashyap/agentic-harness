import { apiFetch } from './client';

export interface MemorySearchResult {
  content: string;
  score: number;
  agentId?: string;
  tags?: string[];
  createdAt: number;
}

export interface StoreMemoryResponse {
  success: boolean;
  memory: {
    id: string;
    content: string;
    agentId?: string;
    tags?: string[];
    createdAt: number;
  };
}

export interface SearchMemoryResponse {
  success: boolean;
  query: string;
  count: number;
  results: MemorySearchResult[];
}

export async function storeMemory(
  fact: string,
  agentId?: string,
  tags?: string[]
): Promise<StoreMemoryResponse> {
  return apiFetch<StoreMemoryResponse>('/memory', {
    method: 'POST',
    body: JSON.stringify({ fact, agentId, tags }),
  });
}

export async function searchMemory(
  query: string,
  agentId?: string,
  limit: number = 5
): Promise<SearchMemoryResponse> {
  return apiFetch<SearchMemoryResponse>('/memory/search', {
    method: 'POST',
    body: JSON.stringify({ query, agentId, limit }),
  });
}
