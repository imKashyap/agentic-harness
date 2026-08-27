import { inject, injectable } from "inversify";

import type { StateStore } from "../core/state/index.js";
import { Checkpoint } from "../core/state/index.js";
import { TYPES } from "../di/types.js";
import { createLogger } from "../utils/logger.js";
import { InputGuard } from "./input-guard.js";
import { OutputGuard } from "./output-guard.js";
import { ToolGuard } from "./tool-guard.js";

const logger = createLogger("PolicyEngine");

export interface ApprovalDecision {
  status: "approved" | "rejected";
  reason?: string;
}

@injectable()
export class PolicyEngine {
  private pendingResolvers = new Map<string, (decision: ApprovalDecision) => void>();

  constructor(
    @inject(TYPES.InputGuard) public readonly inputGuard: InputGuard,
    @inject(TYPES.ToolGuard) public readonly toolGuard: ToolGuard,
    @inject(TYPES.OutputGuard) public readonly outputGuard: OutputGuard,
    @inject(TYPES.StateStore) private readonly stateStore: StateStore,
  ) {}

  async requestApproval(
    runId: string,
    agentId: string,
    taskId: string,
    capability: string,
    input: unknown,
    timeoutMs: number = 300000,
  ): Promise<ApprovalDecision> {
    const token = crypto.randomUUID();
    const checkpoint: Checkpoint = {
      id: token,
      runId,
      agentId,
      taskId,
      capability,
      input,
      status: "pending",
      createdAt: Date.now(),
    };

    await this.stateStore.saveCheckpoint(checkpoint);
    logger.info(
      `Approval required for task [${taskId}] (${capability}) in run [${runId}]. Token: ${token}`,
    );

    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(async () => {
        this.pendingResolvers.delete(token);
        this.pendingResolvers.delete(runId);
        checkpoint.status = "timed_out";
        checkpoint.resolvedAt = Date.now();
        await this.stateStore.saveCheckpoint(checkpoint);
        logger.warn(`Approval timed out for task [${taskId}] in run [${runId}]`);
        resolve({ status: "rejected", reason: "Approval request timed out" });
      }, timeoutMs);

      const resolver = async (decision: ApprovalDecision) => {
        clearTimeout(timer);
        this.pendingResolvers.delete(token);
        this.pendingResolvers.delete(runId);

        checkpoint.status = decision.status;
        checkpoint.reason = decision.reason;
        checkpoint.resolvedAt = Date.now();
        await this.stateStore.saveCheckpoint(checkpoint);

        logger.info(
          `Task [${taskId}] ${decision.status} for run [${runId}] (Reason: ${decision.reason || "None"})`,
        );
        resolve(decision);
      };

      this.pendingResolvers.set(token, resolver);
      this.pendingResolvers.set(runId, resolver);
    });
  }

  async resolveApproval(
    idOrTokenOrRunId: string,
    decision: ApprovalDecision,
  ): Promise<{ success: boolean; checkpoint?: Checkpoint }> {
    const resolver = this.pendingResolvers.get(idOrTokenOrRunId);
    let checkpoint = await this.stateStore.getCheckpoint(idOrTokenOrRunId);

    if (!checkpoint) {
      checkpoint = await this.stateStore.getPendingCheckpointByRunId(idOrTokenOrRunId);
    }

    if (!resolver || !checkpoint) {
      logger.warn(`No active pending approval resolver found for '${idOrTokenOrRunId}'`);
      return { success: false };
    }

    resolver(decision);
    checkpoint.status = decision.status;
    checkpoint.reason = decision.reason;
    checkpoint.resolvedAt = Date.now();
    return { success: true, checkpoint };
  }

  async listPendingApprovals(): Promise<Checkpoint[]> {
    return this.stateStore.listPendingCheckpoints();
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.stateStore.getCheckpoint(id);
  }
}
