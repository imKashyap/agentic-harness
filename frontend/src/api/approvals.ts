import { apiFetch } from './client';

export interface PendingApproval {
  id: string;
  runId: string;
  capability: string;
  input: unknown;
  agentId?: string;
  timestamp: number;
  reason?: string;
}

export async function getApprovals(): Promise<{ success: boolean; pending: PendingApproval[] }> {
  return apiFetch<{ success: boolean; pending: PendingApproval[] }>('/approvals');
}

export async function approveCheckpoint(id: string, reason?: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/runs/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || 'Approved via Web Console' }),
  });
}

export async function rejectCheckpoint(id: string, reason?: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/runs/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || 'Rejected via Web Console' }),
  });
}
