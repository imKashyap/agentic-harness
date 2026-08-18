export interface ExecutionContext {
  runId: string;
  agentId: string;

  parentRunId?: string;
  parentAgentId?: string;

  metadata?: Record<string, unknown>;
}
