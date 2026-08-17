export interface ExecutionContext {
  runId: string;
  agentId: string;

  metadata?: Record<string, unknown>;
}
