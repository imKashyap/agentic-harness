export type ApprovalStatus = "pending" | "approved" | "rejected" | "timed_out";

export interface Checkpoint {
  id: string; // approval token
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

export interface ApprovalDecision {
  status: "approved" | "rejected";
  reason?: string;
}

export interface CheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>;
  get(id: string): Promise<Checkpoint | null>;
  getByRunId(runId: string): Promise<Checkpoint | null>;
  updateStatus(id: string, status: ApprovalStatus, reason?: string): Promise<boolean>;
  list(status?: ApprovalStatus): Promise<Checkpoint[]>;
  delete(id: string): Promise<boolean>;
  clear?(): Promise<void>;
}
