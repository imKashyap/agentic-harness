import { inject, injectable } from "inversify";

import { TYPES } from "../../di/types.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { ExecutionResult } from "../execution/execution-result.js";
import { ExecutionEngine } from "./execution-engine.js";
import { ExecutionPlan } from "./execution-plan.js";
import { PlanValidator } from "./plan-validator.js";
import { Planner } from "./planner.js";
import { PlanningRequest } from "./planning-request.js";

const logger = createLogger("Orchestrator");

@injectable()
export class Orchestrator {
  constructor(
    @inject(TYPES.Planner) private readonly planner: Planner,
    @inject(TYPES.ExecutionEngine) private readonly executionEngine: ExecutionEngine,
    @inject(TYPES.PlanValidator) private readonly planValidator: PlanValidator,
  ) {}

  async plan(request: PlanningRequest): Promise<ExecutionPlan> {
    logger.info(`Orchestrator planning execution for ${request.toolCalls.length} tool call(s)`);
    const plan = await this.planner.createPlan(request);

    logger.debug(`Validating generated plan [${plan.id}]`);
    this.planValidator.validate(plan);

    return plan;
  }

  async execute(plan: ExecutionPlan, context: ExecutionContext): Promise<ExecutionResult[]> {
    logger.info(`Orchestrator executing plan [${plan.id}] with ${plan.tasks.length} task(s)`);
    return this.executionEngine.execute(plan.tasks, context);
  }
}
