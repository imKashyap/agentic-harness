import { PlanStep } from "./plan-step.js";
import { PlanningRequest } from "./planning-request.js";

export interface PlanGenerator {
  generate(request: PlanningRequest): Promise<PlanStep[]>;
}
