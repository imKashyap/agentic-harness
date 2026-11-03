import { inject, injectable, optional } from "inversify";

import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import type { CapabilityExecutor } from "../../capabilities/dispatch/capability-executor.js";
import { formatProgressMessage } from "../../capabilities/progressive-message.js";
import type { Tool } from "../../capabilities/tools/tool.js";
import { TYPES } from "../../di/types.js";
import { CapabilityAccessDeniedError } from "../../errors/capability-errors.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { ApprovalManager } from "../../hitl/approval-manager.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { ExecutionResult } from "../execution/execution-result.js";
import { Task } from "../execution/task.js";
import {
  CONDITION_SKIPPED_REASON,
  evaluateCondition,
  extractCondition,
  extractRefs,
  isSkippedResult,
  resolveTaskInput,
  skippedOutput,
} from "./argument-resolver.js";
import { DependencyGraph } from "./dependency-graph.js";
import { Scheduler } from "./scheduler.js";

const logger = createLogger("ExecutionEngine");

@injectable()
export class ExecutionEngine {
  constructor(
    @inject(TYPES.CapabilityDispatcher) private readonly capabilityExecutor: CapabilityExecutor,
    @inject(TYPES.Scheduler) private readonly scheduler: Scheduler,
    @optional() @inject(TYPES.EventBus) private readonly eventBus?: HarnessEventBus,
    @optional()
    @inject(TYPES.CapabilityRegistry)
    private readonly capabilityRegistry?: CapabilityRegistry,
    @optional() @inject(TYPES.ApprovalManager) private readonly approvalManager?: ApprovalManager,
  ) {}

  async execute(tasks: Task[], context: ExecutionContext): Promise<ExecutionResult[]> {
    logger.info(`Starting execution of ${tasks.length} task(s) (runId: ${context.runId})`);

    const graph = new DependencyGraph(tasks);

    if (graph.hasCycle()) {
      logger.error(`Task dependency graph contains a cycle`);
      throw new Error("Task dependency graph contains a cycle");
    }

    for (const task of tasks) {
      if (!context.allowedCapabilities?.includes(task.capability)) {
        throw new CapabilityAccessDeniedError(task.capability, context.agentId);
      }
    }

    const results: ExecutionResult[] = [];
    const resultsByTaskId = new Map<string, ExecutionResult>();
    let batchNumber = 0;

    while (tasks.some((task) => task.status === "pending" || task.status === "running")) {
      batchNumber++;
      const runnableTasks = this.scheduler.getRunnableTasks(tasks);

      if (runnableTasks.length === 0) {
        const blockedTasks = tasks.filter((task) => task.status === "pending");
        const errorMessage = `No runnable tasks remain. Possible unresolved dependency. Tasks: ${blockedTasks
          .map((task) => task.id)
          .join(", ")}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      logger.info(
        `Executing batch #${batchNumber} with ${runnableTasks.length} parallel task(s): [${runnableTasks
          .map((t) => t.id)
          .join(", ")}]`,
      );

      const batch: ExecutionResult[] = await Promise.all(
        runnableTasks.map((task) => this.executeTask(task, context, resultsByTaskId)),
      );

      results.push(...batch);
      for (const result of batch) {
        resultsByTaskId.set(result.taskId, result);
      }

      // Cascade failures and skips through the DAG instead of stopping all remaining
      // work: only tasks that (transitively) depend on a failed or skipped task are
      // affected — independent tasks keep executing.
      this.cascadeDependents(batch, tasks, context, results, resultsByTaskId);
    }

    logger.info(
      `Execution finished. Total results: ${results.length}, successful: ${
        results.filter((r) => r.status === "completed").length
      }, failed: ${results.filter((r) => r.status === "failed").length}`,
    );

    return results;
  }

  /** Executes one task: dependency guard, condition gate, ref resolution, HITL, capability. */
  private async executeTask(
    task: Task,
    context: ExecutionContext,
    resultsByTaskId: Map<string, ExecutionResult>,
  ): Promise<ExecutionResult> {
    task.status = "running";
    const startTime = Date.now();
    logger.debug(`Task [${task.id}] started (capability: ${task.capability})`);

    this.eventBus?.emit("task:start", {
      runId: context.runId,
      agentId: context.agentId,
      taskId: task.id,
      capability: task.capability,
      input: task.input,
      timestamp: startTime,
    });

    // A dependency that failed or was skipped must not be consumed by this task
    const dependencyProblem = this.findDependencyProblem(task, resultsByTaskId);
    if (dependencyProblem) {
      return dependencyProblem.skip
        ? this.skipTask(task, context, dependencyProblem.reason, startTime)
        : this.failTask(task, context, dependencyProblem.reason, startTime);
    }

    // Deferred-condition gate: skip the task entirely when its "_condition" is false
    const condition = extractCondition(task.input);
    if (condition && !evaluateCondition(condition, resultsByTaskId)) {
      return this.skipTask(task, context, CONDITION_SKIPPED_REASON, startTime);
    }

    // Resolve deferred references ("$<taskId>.<path>") against completed dependencies
    if (extractRefs(task.input).length > 0) {
      try {
        task.input = resolveTaskInput(task, resultsByTaskId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Task [${task.id}] failed to resolve deferred arguments: ${errorMessage}`);
        return this.failTask(task, context, errorMessage, startTime);
      }
    }

    const customProgress = (() => {
      try {
        if (this.capabilityRegistry?.has(task.capability)) {
          const cap = this.capabilityRegistry.get(task.capability);
          if (cap.type === "tool") {
            return (cap as Tool).progressMessage;
          }
        }
      } catch {
        // ignore
      }
      return undefined;
    })();

    this.eventBus?.emit("progressive:message", {
      runId: context.runId,
      agentId: context.agentId,
      taskId: task.id,
      capability: task.capability,
      stage: task.capability.startsWith("agent.") ? "delegating" : "action",
      message: formatProgressMessage(task.capability, task.input, customProgress),
      timestamp: startTime,
    });

    // Check for Human-in-the-Loop (HITL) approval requirement
    if (this.capabilityRegistry && this.approvalManager) {
      let requiresApproval = false;
      try {
        if (this.capabilityRegistry.has(task.capability)) {
          const cap = this.capabilityRegistry.get(task.capability);
          if (cap.type === "tool") {
            const tool = cap as Tool;
            if (typeof tool.requiresApproval === "function") {
              requiresApproval = tool.requiresApproval(task.input, context);
            } else if (tool.requiresApproval === true) {
              requiresApproval = true;
            }
          }
        }
      } catch {
        // ignore lookup error
      }

      if (requiresApproval) {
        logger.info(`Task [${task.id}] requires human approval before execution`);
        const decision = await this.approvalManager.requestApproval(
          context.runId,
          context.agentId,
          task.id,
          task.capability,
          task.input,
        );

        if (decision.status === "rejected") {
          const errorMsg = decision.reason ?? "Task execution was rejected by human approval";
          return this.failTask(task, context, errorMsg, startTime);
        }
      }
    }

    try {
      const result = await this.capabilityExecutor.execute(
        {
          name: task.capability,
          input: task.input,
        },
        context,
      );

      const durationMs = Date.now() - startTime;

      if (result.success) {
        logger.info(`Task [${task.id}] completed successfully in ${durationMs}ms`);
        task.status = "completed";
        this.eventBus?.emit("task:complete", {
          runId: context.runId,
          agentId: context.agentId,
          taskId: task.id,
          capability: task.capability,
          output: result.output,
          durationMs,
          timestamp: Date.now(),
        });
        return {
          taskId: task.id,
          status: "completed" as const,
          output: result.output,
        };
      }

      return this.failTask(task, context, result.error ?? "Unknown error", startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Task [${task.id}] encountered exception: ${errorMessage}`);
      return this.failTask(task, context, errorMessage, startTime);
    }
  }

  /** Returns the first dependency problem (failed or skipped) for a task, if any. */
  private findDependencyProblem(
    task: Task,
    resultsByTaskId: Map<string, ExecutionResult>,
  ): { skip: boolean; reason: string } | undefined {
    for (const dependencyId of task.dependsOn ?? []) {
      const dependency = resultsByTaskId.get(dependencyId);
      if (!dependency) {
        continue;
      }
      if (dependency.status === "failed") {
        return { skip: false, reason: `Dependency '${dependencyId}' failed` };
      }
      if (isSkippedResult(dependency)) {
        return { skip: true, reason: `Skipped because dependency '${dependencyId}' was skipped` };
      }
    }
    return undefined;
  }

  /** Marks a task failed, emits task:failed, and returns its result. */
  private failTask(
    task: Task,
    context: ExecutionContext,
    errorMessage: string,
    startTime: number,
  ): ExecutionResult {
    const durationMs = Date.now() - startTime;
    task.status = "failed";
    logger.error(`Task [${task.id}] failed: ${errorMessage}`);
    this.eventBus?.emit("task:failed", {
      runId: context.runId,
      agentId: context.agentId,
      taskId: task.id,
      capability: task.capability,
      error: errorMessage,
      durationMs,
      timestamp: Date.now(),
    });
    return {
      taskId: task.id,
      status: "failed",
      error: errorMessage,
    };
  }

  /** Marks a task completed-as-skipped, emits task:complete, and returns its result. */
  private skipTask(
    task: Task,
    context: ExecutionContext,
    reason: string,
    startTime: number,
  ): ExecutionResult {
    const durationMs = Date.now() - startTime;
    const output = skippedOutput(reason);
    task.status = "completed";
    logger.info(`Task [${task.id}] skipped: ${reason}`);
    this.eventBus?.emit("task:complete", {
      runId: context.runId,
      agentId: context.agentId,
      taskId: task.id,
      capability: task.capability,
      output,
      durationMs,
      timestamp: Date.now(),
    });
    return {
      taskId: task.id,
      status: "completed" as const,
      output,
    };
  }

  /**
   * Propagates batch failures and skips to every pending transitive dependent:
   * dependents of a failed task fail with a clear reason; dependents of a skipped
   * task are skipped in turn. Independent tasks are unaffected.
   */
  private cascadeDependents(
    batch: ExecutionResult[],
    tasks: Task[],
    context: ExecutionContext,
    results: ExecutionResult[],
    resultsByTaskId: Map<string, ExecutionResult>,
  ): void {
    const graph = new DependencyGraph(tasks);
    const taskById = new Map(tasks.map((task) => [task.id, task] as const));
    const queue = batch
      .filter((result) => result.status === "failed" || isSkippedResult(result))
      .map((result) => result.taskId);
    const visited = new Set(queue);

    while (queue.length > 0) {
      const sourceId = queue.shift() as string;
      const source = resultsByTaskId.get(sourceId);
      if (!source) {
        continue;
      }

      for (const dependentId of graph.getDependents(sourceId)) {
        if (visited.has(dependentId)) {
          continue;
        }
        const dependent = taskById.get(dependentId);
        if (!dependent || dependent.status !== "pending") {
          continue;
        }
        visited.add(dependentId);

        const result =
          source.status === "failed"
            ? this.failTask(dependent, context, `Dependency '${sourceId}' failed`, Date.now())
            : this.skipTask(
                dependent,
                context,
                `Skipped because dependency '${sourceId}' was skipped`,
                Date.now(),
              );
        results.push(result);
        resultsByTaskId.set(result.taskId, result);
        queue.push(dependentId);
      }
    }
  }
}
