import { ExecutionPlan } from "../core/orchestration/execution-plan.js";
import { ToolCall } from "../llm/types.js";

export type HarnessEventType =
  | "run:start"
  | "run:end"
  | "run:error"
  | "token:delta"
  | "thought:delta"
  | "tool:call"
  | "plan:start"
  | "plan:generated"
  | "task:start"
  | "task:complete"
  | "task:failed"
  | "subagent:delegated"
  | "subagent:completed"
  | "memory:recalled"
  | "memory:stored"
  | "hitl:approval_required"
  | "hitl:approved"
  | "hitl:rejected"
  | "progressive:message";

export interface BaseEventPayload {
  runId: string;
  agentId: string;
  timestamp: number;
}

export interface RunStartPayload extends BaseEventPayload {
  sessionId?: string;
  input: string;
}

export interface RunEndPayload extends BaseEventPayload {
  sessionId?: string;
  response: string;
  durationMs: number;
  totalMessages: number;
}

export interface RunErrorPayload extends BaseEventPayload {
  sessionId?: string;
  error: string;
}

export interface TokenDeltaPayload extends BaseEventPayload {
  delta: string;
}

export interface ThoughtDeltaPayload extends BaseEventPayload {
  delta: string;
}

export interface ToolCallPayload extends BaseEventPayload {
  toolCalls: ToolCall[];
}

export interface PlanStartPayload extends BaseEventPayload {
  toolCallCount: number;
}

export interface PlanGeneratedPayload extends BaseEventPayload {
  plan: ExecutionPlan;
}

export interface TaskStartPayload extends BaseEventPayload {
  taskId: string;
  capability: string;
  input: unknown;
}

export interface TaskCompletePayload extends BaseEventPayload {
  taskId: string;
  capability: string;
  output: unknown;
  durationMs: number;
}

export interface TaskFailedPayload extends BaseEventPayload {
  taskId: string;
  capability: string;
  error: string;
  durationMs: number;
}

export interface SubagentDelegatedPayload extends BaseEventPayload {
  parentAgentId: string;
  subAgentId: string;
  task: string;
}

export interface SubagentCompletedPayload extends BaseEventPayload {
  parentAgentId: string;
  subAgentId: string;
  response: string;
  durationMs: number;
}

export interface MemoryRecalledPayload extends BaseEventPayload {
  query: string;
  matchCount: number;
}

export interface MemoryStoredPayload extends BaseEventPayload {
  memoryId: string;
  content: string;
}

export interface HitlApprovalRequiredPayload extends BaseEventPayload {
  taskId: string;
  capability: string;
  input: unknown;
  approvalToken: string;
}

export interface HitlApprovedPayload extends BaseEventPayload {
  taskId: string;
  capability: string;
  approvalToken: string;
  reason?: string;
}

export interface HitlRejectedPayload extends BaseEventPayload {
  taskId: string;
  capability: string;
  approvalToken: string;
  reason?: string;
}

export interface ProgressiveMessagePayload extends BaseEventPayload {
  stage: "planning" | "action" | "delegating" | "processing";
  message: string;
  capability?: string;
  taskId?: string;
}

export interface HarnessEventMap {
  "run:start": RunStartPayload;
  "run:end": RunEndPayload;
  "run:error": RunErrorPayload;
  "token:delta": TokenDeltaPayload;
  "thought:delta": ThoughtDeltaPayload;
  "tool:call": ToolCallPayload;
  "plan:start": PlanStartPayload;
  "plan:generated": PlanGeneratedPayload;
  "task:start": TaskStartPayload;
  "task:complete": TaskCompletePayload;
  "task:failed": TaskFailedPayload;
  "subagent:delegated": SubagentDelegatedPayload;
  "subagent:completed": SubagentCompletedPayload;
  "memory:recalled": MemoryRecalledPayload;
  "memory:stored": MemoryStoredPayload;
  "hitl:approval_required": HitlApprovalRequiredPayload;
  "hitl:approved": HitlApprovedPayload;
  "hitl:rejected": HitlRejectedPayload;
  "progressive:message": ProgressiveMessagePayload;
}

export interface HarnessEvent<T extends HarnessEventType = HarnessEventType> {
  type: T;
  payload: HarnessEventMap[T];
}
