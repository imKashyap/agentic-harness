import { injectable } from "inversify";

import { createLogger } from "../../utils/logger.js";
import { canonicalizeReferences, extractRefs, refTaskId } from "./argument-resolver.js";
import { PlanGenerator } from "./plan-generator.js";
import { PlanStep } from "./plan-step.js";
import { PlanningRequest } from "./planning-request.js";

const logger = createLogger("StaticPlanGenerator");

/**
 * Deterministic plan generator. Dependencies are derived mechanically from deferred
 * references ("$<toolCallId>.<path>") found in each tool call's arguments, so the DAG
 * falls directly out of what the model emitted - no secondary planning LLM required.
 */
@injectable()
export class StaticPlanGenerator implements PlanGenerator {
  async generate(request: PlanningRequest): Promise<PlanStep[]> {
    logger.info(
      `Generating static plan for ${request.toolCalls.length} tool call(s) (dependencies derived from deferred references)`,
    );

    const toolCallIds = new Set(request.toolCalls.map((toolCall) => toolCall.id));

    return request.toolCalls.map((toolCall, index) => {
      const canonicalArgs = canonicalizeReferences(toolCall.arguments, index, request.toolCalls);
      const canonicalToolCall = {
        ...toolCall,
        arguments: canonicalArgs,
      };

      const dependsOn = this.deriveDependencies(toolCall.id, canonicalArgs, toolCallIds);

      if (dependsOn.length > 0) {
        logger.debug(
          `Static plan step: ${toolCall.id} (${toolCall.name}) dependsOn: [${dependsOn.join(", ")}]`,
        );
      } else {
        logger.debug(`Static plan step: ${toolCall.id} (${toolCall.name}) with no dependencies`);
      }

      return {
        id: toolCall.id,
        toolCall: canonicalToolCall,
        dependsOn,
      };
    });
  }

  /**
   * A tool call depends on another call in the same batch iff one of its argument values
   * references that call's output. Self-references and references to unknown call IDs
   * are ignored (unknown references are caught later by the PlanValidator).
   */
  private deriveDependencies(
    toolCallId: string,
    args: unknown,
    knownToolCallIds: Set<string>,
  ): string[] {
    const dependencies = new Set<string>();

    for (const ref of extractRefs(args)) {
      const referencedId = refTaskId(ref);
      if (referencedId !== toolCallId && knownToolCallIds.has(referencedId)) {
        dependencies.add(referencedId);
      }
    }

    return [...dependencies];
  }
}
