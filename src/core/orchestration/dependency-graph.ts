import { createLogger } from "../../utils/logger.js";
import { Task } from "../execution/task.js";

const logger = createLogger("DependencyGraph");

export class DependencyGraph {
  private readonly dependencies = new Map<string, Set<string>>();

  constructor(tasks: Task[]) {
    for (const task of tasks) {
      if (this.dependencies.has(task.id)) {
        logger.warn(`Duplicate task ID found in tasks list: ${task.id}`);
      }
      this.dependencies.set(task.id, new Set(task.dependsOn ?? []));
    }
    logger.debug(`Initialized dependency graph with ${tasks.length} tasks`);
  }

  getDependencies(taskId: string): string[] {
    return [...(this.dependencies.get(taskId) ?? [])];
  }

  isSatisfied(taskId: string, completedTaskIds: Set<string>): boolean {
    const dependencies = this.dependencies.get(taskId) ?? new Set<string>();

    const satisfied = [...dependencies].every((dependencyId) => completedTaskIds.has(dependencyId));
    logger.debug(
      `Task ${taskId} dependencies [${[...dependencies].join(", ")}] satisfied: ${satisfied}`,
    );
    return satisfied;
  }

  getDependents(taskId: string): string[] {
    const dependents: string[] = [];

    for (const [currentTaskId, dependencies] of this.dependencies) {
      if (dependencies.has(taskId)) {
        dependents.push(currentTaskId);
      }
    }

    return dependents;
  }

  hasCycle(): boolean {
    const visiting = new Set<string>();

    const visited = new Set<string>();

    const visit = (taskId: string): boolean => {
      if (visiting.has(taskId)) {
        logger.warn(`Cycle detected in dependency graph at task: ${taskId}`);
        return true;
      }

      if (visited.has(taskId)) {
        return false;
      }

      visiting.add(taskId);

      for (const dependencyId of this.getDependencies(taskId)) {
        if (this.visitDependency(dependencyId, visit)) {
          return true;
        }
      }

      visiting.delete(taskId);
      visited.add(taskId);

      return false;
    };

    for (const taskId of this.dependencies.keys()) {
      if (visit(taskId)) {
        return true;
      }
    }

    return false;
  }

  private visitDependency(dependencyId: string, visit: (taskId: string) => boolean): boolean {
    return visit(dependencyId);
  }
}
