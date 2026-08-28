import { apiFetch } from './client';

export interface HealthResponse {
  status: string;
  timestamp: number;
  uptime: number;
  metrics?: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalDurationMs: number;
    averageDurationMs: number;
    tokensSummary?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}
