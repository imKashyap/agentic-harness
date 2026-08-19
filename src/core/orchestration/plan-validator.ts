import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { createLogger } from "../../utils/logger.js";
import { DependencyGraph } from "./dependency-graph.js";
import { ExecutionPlan } from "./execution-plan.js";

const logger = createLogger("PlanValidator");

export class PlanValidator {
  constructor(private readonly capabilityRegistry?: CapabilityRegistry) {}

  validate(plan: ExecutionPlan): void {
    logger.debug(`Validating execution plan [${plan.id}] with ${plan.tasks.length} task(s)`);

    this.validateDuplicateTaskIds(plan);
    this.validateDependencies(plan);
    this.validateCycles(plan);
    this.validateCapabilities(plan);

    logger.info(`Execution plan [${plan.id}] validated successfully`);
  }

  private validateDuplicateTaskIds(plan: ExecutionPlan): void {
    const ids = new Set<string>();

    for (const task of plan.tasks) {
      if (ids.has(task.id)) {
        const errorMsg = `Duplicate task id in plan: ${task.id}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      ids.add(task.id);
    }
  }

  private validateDependencies(plan: ExecutionPlan): void {
    const taskIds = new Set(plan.tasks.map((task) => task.id));

    for (const task of plan.tasks) {
      for (const dependencyId of task.dependsOn ?? []) {
        if (!taskIds.has(dependencyId)) {
          const errorMsg = `Task ${task.id} depends on missing task ${dependencyId}`;
          logger.error(errorMsg);
          throw new Error(errorMsg);
        }
      }
    }
  }

  private validateCycles(plan: ExecutionPlan): void {
    const graph = new DependencyGraph(plan.tasks);

    if (graph.hasCycle()) {
      const errorMsg = "Execution plan contains a dependency cycle";
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  private validateCapabilities(plan: ExecutionPlan): void {
    if (!this.capabilityRegistry) {
      return;
    }

    for (const task of plan.tasks) {
      if (!this.capabilityRegistry.has(task.capability)) {
        const errorMsg = `Plan contains unregistered capability: '${task.capability}' (task: ${task.id})`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      try {
        const capability = this.capabilityRegistry.get(task.capability);
        if (capability.type === "skill") {
          logger.warn(
            `Task [${task.id}] references skill '${task.capability}' which has no direct execution handler`,
          );
        }
      } catch (error) {
        const errorMsg = `Failed to resolve capability for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }
}
