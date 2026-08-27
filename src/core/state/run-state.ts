export type ApprovalStatus = "pending" | "approved" | "rejected" | "timed_out";

export interface Checkpoint {
  id: string; // Token ID
  runId: string;
  agentId: string;
  taskId: string;
  capability: string;
  input: unknown;
  status: ApprovalStatus;
  reason?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface RunState {
  runId: string;
  agentId: string;
  status: "idle" | "running" | "waiting_approval" | "completed" | "failed";
  checkpoints: Checkpoint[];
  startTime: number;
  endTime?: number;
}
