export interface ExecutionContext {
  runId: string;
  agentId: string;
  /** Trusted identity supplied by the host application, never by model arguments. */
  principalId?: string;
  /** Capabilities resolved from the active agent's configuration. */
  allowedCapabilities?: string[];
  /** Memory scope resolved from the active agent's configuration. */
  memoryScope?: "user" | "agent";

  parentRunId?: string;
  parentAgentId?: string;

  metadata?: Record<string, unknown>;
}
