import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { ExecutionResult } from "../execution/execution-result.js";
import { ExecutionEngine } from "./execution-engine.js";
import { ExecutionPlan } from "./execution-plan.js";
import { PlanValidator } from "./plan-validator.js";
import { Planner } from "./planner.js";
import { PlanningRequest } from "./planning-request.js";

const logger = createLogger("Orchestrator");

export class Orchestrator {
  constructor(
    private readonly planner: Planner,
    private readonly executionEngine: ExecutionEngine,
    private readonly planValidator: PlanValidator,
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
