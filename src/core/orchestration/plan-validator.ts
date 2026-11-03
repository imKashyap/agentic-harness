import { inject, injectable, optional } from "inversify";

import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { TYPES } from "../../di/types.js";
import { CapabilityNotFoundError } from "../../errors/capability-errors.js";
import {
  DependencyCycleError,
  DuplicateTaskIdError,
  MissingDependencyError,
  PlanValidationError,
} from "../../errors/orchestration-errors.js";
import { createLogger } from "../../utils/logger.js";
import {
  canonicalizeReferences,
  extractRefs,
  isTaskCondition,
  refTaskId,
  resolveTaskAlias,
} from "./argument-resolver.js";
import { DependencyGraph } from "./dependency-graph.js";
import { ExecutionPlan } from "./execution-plan.js";

const logger = createLogger("PlanValidator");

@injectable()
export class PlanValidator {
  constructor(
    @optional()
    @inject(TYPES.CapabilityRegistry)
    private readonly capabilityRegistry?: CapabilityRegistry,
  ) {}

  validate(plan: ExecutionPlan): void {
    logger.debug(`Validating execution plan [${plan.id}] with ${plan.tasks.length} task(s)`);

    this.validateDuplicateTaskIds(plan);
    this.validateDependencies(plan);
    this.validateCycles(plan);
    this.validateDeferredReferences(plan);
    this.validateCapabilities(plan);

    logger.info(`Execution plan [${plan.id}] validated successfully`);
  }

  private validateDuplicateTaskIds(plan: ExecutionPlan): void {
    const ids = new Set<string>();

    for (const task of plan.tasks) {
      if (ids.has(task.id)) {
        logger.error(`Duplicate task ID in plan: ${task.id}`);
        throw new DuplicateTaskIdError(task.id);
      }

      ids.add(task.id);
    }
  }

  private validateDependencies(plan: ExecutionPlan): void {
    const taskIds = new Set(plan.tasks.map((task) => task.id));

    for (const task of plan.tasks) {
      for (const dependencyId of task.dependsOn ?? []) {
        if (!taskIds.has(dependencyId)) {
          logger.error(`Task ${task.id} depends on missing task ${dependencyId}`);
          throw new MissingDependencyError(task.id, dependencyId);
        }
      }
    }
  }

  private validateCycles(plan: ExecutionPlan): void {
    const graph = new DependencyGraph(plan.tasks);

    if (graph.hasCycle()) {
      logger.error("Execution plan contains a dependency cycle");
      throw new DependencyCycleError("plan_root");
    }
  }

  /**
   * Validates deferred references ("$<toolCallId>.<path>") and "_condition" objects in
   * task inputs: every referenced task must exist in the plan and be declared in the
   * referencing task's dependsOn, and conditions must be well-formed.
   */
  private validateDeferredReferences(plan: ExecutionPlan): void {
    const taskIds = new Set(plan.tasks.map((task) => task.id));
    const taskSummaries = plan.tasks.map((t) => ({ id: t.id, name: t.capability }));

    for (let taskIndex = 0; taskIndex < plan.tasks.length; taskIndex++) {
      const task = plan.tasks[taskIndex]!;
      for (const ref of extractRefs(task.input)) {
        let referencedId = refTaskId(ref);

        if (!taskIds.has(referencedId)) {
          const resolved = resolveTaskAlias(referencedId, taskIndex, taskSummaries);
          if (taskIds.has(resolved)) {
            referencedId = resolved;
          }
        }

        if (!taskIds.has(referencedId)) {
          logger.error(
            `Task ${task.id} references unknown task '${referencedId}' in deferred ref '${ref}'`,
          );
          throw new PlanValidationError(
            `Task '${task.id}' references unknown task '${referencedId}' in deferred ref '${ref}'`,
            { taskId: task.id, ref, referencedId },
          );
        }

        if (!(task.dependsOn ?? []).includes(referencedId)) {
          logger.error(
            `Task ${task.id} references task '${referencedId}' via '${ref}' but does not declare it in dependsOn`,
          );
          throw new PlanValidationError(
            `Task '${task.id}' references task '${referencedId}' via '${ref}' but does not declare it in dependsOn`,
            { taskId: task.id, ref, referencedId },
          );
        }
      }

      const rawInput = task.input as Record<string, unknown> | null;
      if (
        rawInput !== null &&
        typeof rawInput === "object" &&
        "_condition" in rawInput &&
        !isTaskCondition(rawInput["_condition"])
      ) {
        logger.error(`Task ${task.id} has a malformed '_condition' object`);
        throw new PlanValidationError(`Task '${task.id}' has a malformed '_condition' object`, {
          taskId: task.id,
        });
      }
    }
  }

  private validateCapabilities(plan: ExecutionPlan): void {
    if (!this.capabilityRegistry) {
      return;
    }

    for (const task of plan.tasks) {
      if (!this.capabilityRegistry.has(task.capability)) {
        logger.error(
          `Plan contains unregistered capability: '${task.capability}' (task: ${task.id})`,
        );
        throw new CapabilityNotFoundError(task.capability);
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
        throw new PlanValidationError(errorMsg, { taskId: task.id, capability: task.capability });
      }
    }
  }
}
