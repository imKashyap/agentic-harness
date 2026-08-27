import { injectable, unmanaged } from "inversify";

import { createLogger } from "../../utils/logger.js";
import { LLMPlanGenerator } from "./llm-plan-generator.js";
import type { PlanGenerator } from "./plan-generator.js";
import type { PlanStep } from "./plan-step.js";
import type { PlanningRequest } from "./planning-request.js";
import { StaticPlanGenerator } from "./static-plan-generator.js";

const logger = createLogger("AdaptivePlanGenerator");

export interface AdaptivePlanGeneratorOptions {
  fallbackToStaticOnError?: boolean;
}

@injectable()
export class AdaptivePlanGenerator implements PlanGenerator {
  constructor(
    private readonly staticGenerator: StaticPlanGenerator,
    private readonly llmGenerator: LLMPlanGenerator,
    @unmanaged()
    private readonly options: AdaptivePlanGeneratorOptions = { fallbackToStaticOnError: true },
  ) {}

  async generate(request: PlanningRequest): Promise<PlanStep[]> {
    const callCount = request.toolCalls.length;

    // Fast-path: 0 or 1 tool call -> No need for secondary LLM planning round-trip
    if (callCount <= 1) {
      logger.info(
        `Fast-path: ${callCount} tool call(s) detected. Generating static plan (0 extra LLM calls)`,
      );
      return this.staticGenerator.generate(request);
    }

    // Dynamic-path: Multiple tool calls -> Use LLM planner to determine data dependencies & DAG
    logger.info(
      `Dynamic-path: ${callCount} tool calls detected. Invoking Planner LLM for DAG dependency resolution`,
    );

    try {
      return await this.llmGenerator.generate(request);
    } catch (error) {
      if (this.options.fallbackToStaticOnError) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Planner LLM failed (${errorMsg}). Falling back to static parallel plan generation to ensure execution continuity`,
        );
        return this.staticGenerator.generate(request);
      }

      throw error;
    }
  }
}
