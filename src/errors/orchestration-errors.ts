import { HarnessError } from "./harness-error.js";

export class DependencyCycleError extends HarnessError {
  constructor(public readonly taskId: string) {
    super(`Dependency cycle detected in plan at task: ${taskId}`, "DEPENDENCY_CYCLE", 400, {
      taskId,
    });
  }
}

export class MissingDependencyError extends HarnessError {
  constructor(
    public readonly taskId: string,
    public readonly missingDependencyId: string,
  ) {
    super(
      `Task '${taskId}' depends on non-existent task '${missingDependencyId}'`,
      "MISSING_DEPENDENCY",
      400,
      { taskId, missingDependencyId },
    );
  }
}

export class DuplicateTaskIdError extends HarnessError {
  constructor(public readonly taskId: string) {
    super(`Duplicate task ID in plan: ${taskId}`, "DUPLICATE_TASK_ID", 400, { taskId });
  }
}

export class PlanValidationError extends HarnessError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PLAN_VALIDATION_ERROR", 400, details);
  }
}

export class AgentNotFoundError extends HarnessError {
  constructor(public readonly agentId: string) {
    super(`Agent not found: ${agentId}`, "AGENT_NOT_FOUND", 404, { agentId });
  }
}

export class AgentExecutionError extends HarnessError {
  constructor(
    public readonly agentId: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(`Agent '${agentId}' execution failed: ${message}`, "AGENT_EXECUTION_ERROR", 500, {
      agentId,
      ...details,
    });
  }
}
