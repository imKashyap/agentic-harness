import { apiFetch } from './client';

export interface MemorySearchResult {
  content: string;
  score: number;
  createdByAgentId?: string;
  tags?: string[];
  createdAt: number;
}

export interface StoreMemoryResponse {
  success: boolean;
  memory: {
    id: string;
    content: string;
    createdByAgentId?: string;
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
  tags?: string[]
): Promise<StoreMemoryResponse> {
  return apiFetch<StoreMemoryResponse>('/memory', {
    method: 'POST',
    body: JSON.stringify({ fact, tags }),
  });
}

export async function searchMemory(
  query: string,
  limit: number = 5,
): Promise<SearchMemoryResponse> {
  return apiFetch<SearchMemoryResponse>('/memory/search', {
    method: 'POST',
    body: JSON.stringify({ query, limit }),
  });
}
