import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { createLogger } from "../../utils/logger.js";
import { Task } from "../execution/task.js";
import { ExecutionPlan } from "./execution-plan.js";
import { PlanGenerator } from "./plan-generator.js";
import { PlanningRequest } from "./planning-request.js";

const logger = createLogger("Planner");

export class Planner {
  constructor(
    private readonly planGenerator: PlanGenerator,
    private readonly capabilityRegistry?: CapabilityRegistry,
  ) {}

  async createPlan(request: PlanningRequest): Promise<ExecutionPlan> {
    logger.info(`Creating plan for ${request.toolCalls.length} tool call(s)`);

    const enrichedRequest: PlanningRequest = {
      ...request,
      capabilities: request.capabilities ?? this.capabilityRegistry?.getAll(),
    };

    const steps = await this.planGenerator.generate(enrichedRequest);

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
