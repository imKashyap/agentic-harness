import { CapabilityExecutor } from "../../capabilities/dispatch/capability-executor.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { ExecutionResult } from "../execution/execution-result.js";
import { Task } from "../execution/task.js";
import { DependencyGraph } from "./dependency-graph.js";
import { Scheduler } from "./scheduler.js";

const logger = createLogger("ExecutionEngine");

export class ExecutionEngine {
  constructor(
    private readonly capabilityExecutor: CapabilityExecutor,
    private readonly scheduler: Scheduler,
    private readonly eventBus?: HarnessEventBus,
  ) {}

  async execute(tasks: Task[], context: ExecutionContext): Promise<ExecutionResult[]> {
    logger.info(`Starting execution of ${tasks.length} task(s) (runId: ${context.runId})`);

    const graph = new DependencyGraph(tasks);

    if (graph.hasCycle()) {
      logger.error(`Task dependency graph contains a cycle`);
      throw new Error("Task dependency graph contains a cycle");
    }

    const results: ExecutionResult[] = [];
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
        runnableTasks.map(async (task) => {
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

          try {
            const result = await this.capabilityExecutor.execute(
              {
                name: task.capability,
                input: task.input,
              },
              context,
            );

            const durationMs = Date.now() - startTime;
            const status: "completed" | "failed" = result.success ? "completed" : "failed";
            task.status = status;

            if (result.success) {
              logger.info(`Task [${task.id}] completed successfully in ${durationMs}ms`);
              this.eventBus?.emit("task:complete", {
                runId: context.runId,
                agentId: context.agentId,
                taskId: task.id,
                capability: task.capability,
                output: result.output,
                durationMs,
                timestamp: Date.now(),
              });
            } else {
              logger.warn(
                `Task [${task.id}] failed in ${durationMs}ms: ${result.error ?? "Unknown error"}`,
              );
              this.eventBus?.emit("task:failed", {
                runId: context.runId,
                agentId: context.agentId,
                taskId: task.id,
                capability: task.capability,
                error: result.error ?? "Unknown error",
                durationMs,
                timestamp: Date.now(),
              });
            }

            return {
              taskId: task.id,
              status,
              output: result.output,
              error: result.error,
            };
          } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            task.status = "failed";
            logger.error(
              `Task [${task.id}] encountered exception in ${durationMs}ms: ${errorMessage}`,
            );

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
              status: "failed" as const,
              error: errorMessage,
            };
          }
        }),
      );

      results.push(...batch);

      if (batch.some((result) => result.status === "failed")) {
        logger.warn(`Batch #${batchNumber} had failures; stopping remaining task execution`);
        break;
      }
    }

    logger.info(
      `Execution finished. Total results: ${results.length}, successful: ${
        results.filter((r) => r.status === "completed").length
      }, failed: ${results.filter((r) => r.status === "failed").length}`,
    );

    return results;
  }
}
