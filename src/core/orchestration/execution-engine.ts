import { CapabilityExecutor } from "../../capabilities/execution/capability-executor.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { ExecutionResult } from "../execution/execution-result.js";
import { Task } from "../execution/task.js";

export class ExecutionEngine {
  constructor(private readonly capabilityExecutor: CapabilityExecutor) {}

  async execute(tasks: Task[], context: ExecutionContext): Promise<ExecutionResult[]> {
    const results = await Promise.all(
      tasks.map(async (task): Promise<ExecutionResult> => {
        task.status = "running";

        try {
          const result = await this.capabilityExecutor.execute(
            {
              name: task.capability,
              input: task.input,
            },
            context,
          );

          task.status = result.success ? "completed" : "failed";

          return {
            taskId: task.id,
            status: result.success ? "completed" : "failed",
            output: result.output,
            error: result.error,
          };
        } catch (error) {
          task.status = "failed";

          return {
            taskId: task.id,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return results;
  }
}
