import { apiFetch } from './client';

export interface CapabilityItem {
  id: string;
  name: string;
  type: 'skill' | 'tool' | 'agent';
  description: string;
  inputSchema?: Record<string, unknown>;
  requiresApproval?: boolean;
}

export async function getCapabilities(): Promise<{ success: boolean; capabilities: CapabilityItem[] }> {
  return apiFetch<{ success: boolean; capabilities: CapabilityItem[] }>('/capabilities');
}
