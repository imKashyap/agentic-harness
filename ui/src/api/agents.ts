import { apiFetch } from './client';

export interface Agent {
  id: string;
  name: string;
  description: string;
  type: 'agent';
  model?: {
    provider: string;
    model: string;
    generation?: {
      temperature?: number;
      maxTokens?: number;
    };
  };
  skills?: string[];
  tools?: string[];
  subAgents?: string[];
}

export async function getAgents(): Promise<{ success: boolean; agents: Agent[] }> {
  return apiFetch<{ success: boolean; agents: Agent[] }>('/agents');
}
