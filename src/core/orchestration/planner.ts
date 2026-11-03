import { inject, injectable } from "inversify";

import { TYPES } from "../../di/types.js";
import { createLogger } from "../../utils/logger.js";
import { Task } from "../execution/task.js";
import { ExecutionPlan } from "./execution-plan.js";
import type { PlanGenerator } from "./plan-generator.js";
import { PlanningRequest } from "./planning-request.js";

const logger = createLogger("Planner");

@injectable()
export class Planner {
  constructor(@inject(TYPES.PlanGenerator) private readonly planGenerator: PlanGenerator) {}

  async createPlan(request: PlanningRequest): Promise<ExecutionPlan> {
    logger.info(`Creating plan for ${request.toolCalls.length} tool call(s)`);

    const steps = await this.planGenerator.generate(request);

    const tasks: Task[] = steps.map((step) => {
      logger.debug(
        `Task [${step.id}] for capability '${step.toolCall.name}' (dependsOn: [${step.dependsOn.join(", ")}])`,
      );
      return {
        id: step.id,
        type: "capability",
        capability: step.toolCall.name,
        input: step.toolCall.arguments,
        status: "pending",
        dependsOn: step.dependsOn,
      };
    });

    const plan: ExecutionPlan = {
      id: crypto.randomUUID(),
      tasks,
      createdAt: Date.now(),
    };

    logger.info(`Created execution plan [${plan.id}] with ${tasks.length} task(s)`);
    return plan;
  }
}
