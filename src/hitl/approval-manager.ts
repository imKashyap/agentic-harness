import { inject, injectable, optional } from "inversify";

import { TYPES } from "../di/types.js";
import { HarnessEventBus } from "../events/event-bus.js";
import { createLogger } from "../utils/logger.js";
import type { ApprovalDecision, Checkpoint, CheckpointStore } from "./types.js";

const logger = createLogger("ApprovalManager");

interface PendingDeferred {
  checkpoint: Checkpoint;
  resolve: (decision: ApprovalDecision) => void;
  timer: NodeJS.Timeout;
}

@injectable()
export class ApprovalManager {
  private readonly pendingMap = new Map<string, PendingDeferred>();
  private readonly store: CheckpointStore;

  constructor(
    @inject(TYPES.CheckpointStore) store: CheckpointStore,
    @optional() @inject(TYPES.EventBus) private readonly eventBus?: HarnessEventBus,
  ) {
    this.store = store;
  }

  async requestApproval(
    runId: string,
    agentId: string,
    taskId: string,
    capability: string,
    input: unknown,
    timeoutMs: number = 300_000,
  ): Promise<ApprovalDecision> {
    const approvalToken = crypto.randomUUID();
    const checkpoint: Checkpoint = {
      id: approvalToken,
      runId,
      agentId,
      taskId,
      capability,
      input,
      status: "pending",
      createdAt: Date.now(),
    };

    await this.store.save(checkpoint);

    logger.info(
      `Approval required for task [${taskId}] (${capability}) in run [${runId}]. Token: ${approvalToken}`,
    );

    this.eventBus?.emit("hitl:approval_required", {
      runId,
      agentId,
      taskId,
      capability,
      input,
      approvalToken,
      timestamp: Date.now(),
    });

    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(async () => {
        this.pendingMap.delete(approvalToken);
        await this.store.updateStatus(approvalToken, "timed_out", "Approval request timed out");
        logger.warn(`Approval request for token [${approvalToken}] timed out`);
        resolve({
          status: "rejected",
          reason: `Approval timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      if (typeof timer.unref === "function") {
        timer.unref();
      }

      this.pendingMap.set(approvalToken, { checkpoint, resolve, timer });
    });
  }

  async resolveDecision(
    idOrRunId: string,
    decision: ApprovalDecision,
  ): Promise<{ success: boolean; checkpoint: Checkpoint | null }> {
    let pending = this.pendingMap.get(idOrRunId);
    let token = idOrRunId;

    if (!pending) {
      for (const [key, val] of this.pendingMap.entries()) {
        if (val.checkpoint.runId === idOrRunId) {
          pending = val;
          token = key;
          break;
        }
      }
    }

    let checkpoint = await this.store.get(token);
    if (!checkpoint) {
      checkpoint = await this.store.getByRunId(idOrRunId);
    }

    if (!checkpoint) {
      logger.warn(`No checkpoint found for ID or runId '${idOrRunId}'`);
      return { success: false, checkpoint: null };
    }

    const newStatus = decision.status === "approved" ? "approved" : "rejected";
    await this.store.updateStatus(checkpoint.id, newStatus, decision.reason);
    checkpoint.status = newStatus;
    checkpoint.reason = decision.reason;
    checkpoint.resolvedAt = Date.now();

    if (decision.status === "approved") {
      this.eventBus?.emit("hitl:approved", {
        runId: checkpoint.runId,
        agentId: checkpoint.agentId,
        taskId: checkpoint.taskId,
        capability: checkpoint.capability,
        approvalToken: checkpoint.id,
        reason: decision.reason,
        timestamp: Date.now(),
      });
    } else {
      this.eventBus?.emit("hitl:rejected", {
        runId: checkpoint.runId,
        agentId: checkpoint.agentId,
        taskId: checkpoint.taskId,
        capability: checkpoint.capability,
        approvalToken: checkpoint.id,
        reason: decision.reason,
        timestamp: Date.now(),
      });
    }

    if (pending) {
      clearTimeout(pending.timer);
      this.pendingMap.delete(token);
      pending.resolve(decision);
    }

    return { success: true, checkpoint };
  }

  async listPending(): Promise<Checkpoint[]> {
    return this.store.list("pending");
  }

  getStore(): CheckpointStore {
    return this.store;
  }
}
