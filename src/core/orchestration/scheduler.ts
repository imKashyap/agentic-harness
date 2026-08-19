import { createLogger } from "../../utils/logger.js";
import { Task } from "../execution/task.js";
import { DependencyGraph } from "./dependency-graph.js";

const logger = createLogger("Scheduler");

export class Scheduler {
  getRunnableTasks(tasks: Task[]): Task[] {
    const graph = new DependencyGraph(tasks);

    const completedIds = new Set(
      tasks.filter((task) => task.status === "completed").map((task) => task.id),
    );

    const runnable = tasks.filter((task) => {
      if (task.status !== "pending") {
        return false;
      }

      return graph.isSatisfied(task.id, completedIds);
    });

    logger.debug(
      `getRunnableTasks: found ${runnable.length} runnable tasks (${runnable.map((t) => t.id).join(", ") || "none"}) out of ${tasks.length} total tasks`,
    );

    return runnable;
  }
}
