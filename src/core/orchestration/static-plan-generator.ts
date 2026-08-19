import { createLogger } from "../../utils/logger.js";
import { PlanGenerator } from "./plan-generator.js";
import { PlanStep } from "./plan-step.js";
import { PlanningRequest } from "./planning-request.js";

const logger = createLogger("StaticPlanGenerator");

export class StaticPlanGenerator implements PlanGenerator {
  async generate(request: PlanningRequest): Promise<PlanStep[]> {
    logger.info(
      `Generating static plan for ${request.toolCalls.length} tool call(s) (independent/parallel)`,
    );

    return request.toolCalls.map((toolCall) => {
      logger.debug(`Static plan step: ${toolCall.id} (${toolCall.name}) with no dependencies`);
      return {
        id: toolCall.id,
        toolCall,
        dependsOn: [],
      };
    });
  }
}
