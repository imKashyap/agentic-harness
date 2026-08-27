import { EventEmitter } from "node:events";

import { injectable } from "inversify";

import { ExecutionPlan } from "../core/orchestration/execution-plan.js";
import { ToolCall } from "../llm/types.js";
import { createLogger } from "./logging.js";

const logger = createLogger("EventBus");

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
  | "hitl:rejected";

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
}

export interface HarnessEvent<T extends HarnessEventType = HarnessEventType> {
  type: T;
  payload: HarnessEventMap[T];
}

export type EventListener<T extends HarnessEventType> = (payload: HarnessEventMap[T]) => void;

@injectable()
export class HarnessEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  public emit<T extends HarnessEventType>(type: T, payload: HarnessEventMap[T]): boolean {
    logger.debug(`Event emitted: ${type} (runId: ${payload.runId})`);
    this.emitter.emit("*", { type, payload });
    return this.emitter.emit(type, payload);
  }

  public on<T extends HarnessEventType>(type: T, listener: EventListener<T>): () => void {
    this.emitter.on(type, listener as (...args: unknown[]) => void);
    return () => this.off(type, listener);
  }

  public onAny(listener: (event: HarnessEvent) => void): () => void {
    this.emitter.on("*", listener as (...args: unknown[]) => void);
    return () => this.emitter.off("*", listener as (...args: unknown[]) => void);
  }

  public off<T extends HarnessEventType>(type: T, listener: EventListener<T>): void {
    this.emitter.off(type, listener as (...args: unknown[]) => void);
  }

  public async *subscribe(filterRunId?: string): AsyncIterable<HarnessEvent> {
    if (filterRunId) {
      yield* this.subscribeToRun(filterRunId);
      return;
    }

    const queue: HarnessEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let finished = false;

    const cleanup = this.onAny((event) => {
      queue.push(event);
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve();
      }
      if (event.type === "run:end" || event.type === "run:error") {
        finished = true;
      }
    });

    try {
      while (!finished || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolveNext = r;
          });
        }
        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    } finally {
      cleanup();
    }
  }

  public async *subscribeToRun(runId: string): AsyncIterable<HarnessEvent> {
    const queue: HarnessEvent[] = [];
    let resolveNext: ((value: HarnessEvent | null) => void) | null = null;
    let isFinished = false;

    const listener = (event: HarnessEvent): void => {
      if (event.payload.runId !== runId) {
        return;
      }

      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve(event);
      } else {
        queue.push(event);
      }

      if (event.type === "run:end" || event.type === "run:error") {
        isFinished = true;
      }
    };

    const unsubscribe = this.onAny(listener);

    try {
      while (!isFinished || queue.length > 0) {
        if (queue.length > 0) {
          const item = queue.shift()!;
          yield item;
          if (item.type === "run:end" || item.type === "run:error") {
            break;
          }
        } else {
          const event = await new Promise<HarnessEvent | null>((resolve) => {
            resolveNext = resolve;
          });

          if (!event) {
            break;
          }

          yield event;

          if (event.type === "run:end" || event.type === "run:error") {
            break;
          }
        }
      }
    } finally {
      unsubscribe();
    }
  }
}
