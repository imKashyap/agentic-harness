import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { LLM } from "../../llm/model.js";
import { createLogger } from "../../utils/logger.js";
import { PlanGenerator } from "./plan-generator.js";
import { PlanStep } from "./plan-step.js";
import { PlanningRequest } from "./planning-request.js";

const logger = createLogger("LLMPlanGenerator");

interface LLMPlanStep {
  id: string;
  toolCallId: string;
  dependsOn: string[];
}

interface LLMPlan {
  steps: LLMPlanStep[];
}

export class LLMPlanGenerator implements PlanGenerator {
  constructor(
    private readonly llm: LLM,
    private readonly capabilityRegistry?: CapabilityRegistry,
  ) {}

  async generate(request: PlanningRequest): Promise<PlanStep[]> {
    logger.info(
      `Generating capability-aware execution plan for ${request.toolCalls.length} tool call(s)`,
    );

    const enrichedCalls = request.toolCalls.map((toolCall) => {
      let capabilityInfo: {
        id: string;
        name?: string;
        type?: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      } = { id: toolCall.name };

      if (this.capabilityRegistry?.has(toolCall.name)) {
        try {
          const cap = this.capabilityRegistry.get(toolCall.name);
          capabilityInfo = {
            id: cap.id,
            name: cap.name,
            type: cap.type,
            description: cap.description,
            inputSchema:
              "inputSchema" in cap ? (cap.inputSchema as Record<string, unknown>) : undefined,
          };
        } catch {
          // fallback to basic info
        }
      }

      return {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        capability: capabilityInfo,
      };
    });

    const systemPrompt = `
You are an intelligent capability-aware execution planner.

Your job is to analyze the requested capability calls (tools and specialized agents) and determine their optimal execution order and data dependencies.

Capability Types & Dependency Guidelines:
1. "agent" (e.g. agent.researcher): Sub-agents that conduct research, search, or deep analysis to produce answers or context.
2. "tool" (e.g. tool.calculator): Deterministic tools that compute or perform discrete operations.
3. "skill": Workflow or procedural guidance.

Dependency Rules:
- If a task logically requires data, facts, or results produced by an earlier research agent or tool, it MUST declare a dependency in "dependsOn".
- If tasks are independent of each other (e.g. parallel calculations or unrelated research questions), "dependsOn" should be empty [] to allow maximum parallel execution.
- Every input tool call MUST be included in the plan exactly once.
- "id" should match the step ID (or toolCallId).
- "toolCallId" MUST match the input tool call "id".
- "dependsOn" MUST only contain valid "id"s or "toolCallId"s of prerequisite tasks.
- Never create circular dependencies.

Return ONLY valid JSON matching this schema:
{
  "steps": [
    {
      "id": "string",
      "toolCallId": "string",
      "dependsOn": ["string"]
    }
  ]
}
`;

    const userPrompt = `
Analyze the following capability calls and their metadata:

${JSON.stringify(enrichedCalls, null, 2)}

Create the execution plan JSON with appropriate dependencies:
`;

    logger.debug("Calling Planner LLM with capability-enriched prompt");
    const response = await this.llm.chat({
      messages: [
        {
          role: "system",
          content: systemPrompt.trim(),
        },
        {
          role: "user",
          content: userPrompt.trim(),
        },
      ],
    });

    const content = response.content;
    if (!content || content.trim().length === 0) {
      logger.error("Planner LLM returned an empty response");
      throw new Error("Planner LLM returned empty response");
    }

    const parsed = this.parsePlan(content);
    const steps = this.convertToPlanSteps(parsed, request);

    logger.info(`Generated plan with ${steps.length} steps and dependencies:`);
    for (const step of steps) {
      logger.debug(
        `Step [${step.id}] (toolCall: ${step.toolCall.name}) dependsOn: [${step.dependsOn.join(", ")}]`,
      );
    }

    return steps;
  }

  private parsePlan(content: string): LLMPlan {
    let json = content.trim();

    if (json.startsWith("```")) {
      json = json.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    } else {
      const match = /\{[\s\S]*\}/.exec(json);
      if (match) {
        json = match[0];
      }
    }

    try {
      return JSON.parse(json) as LLMPlan;
    } catch {
      logger.error(`Planner LLM returned invalid JSON: ${content}`);
      throw new Error(`Planner LLM returned invalid JSON: ${content}`);
    }
  }

  private convertToPlanSteps(plan: LLMPlan, request: PlanningRequest): PlanStep[] {
    const toolCalls = new Map(request.toolCalls.map((toolCall) => [toolCall.id, toolCall]));

    if (!plan || !Array.isArray(plan.steps)) {
      logger.error("Invalid planner response: steps must be an array");
      throw new Error("Invalid planner response: steps must be an array");
    }

    const seen = new Set<string>();

    return plan.steps.map((step) => {
      if (seen.has(step.toolCallId)) {
        logger.error(`Planner returned duplicate toolCallId: ${step.toolCallId}`);
        throw new Error(`Planner returned duplicate toolCallId: ${step.toolCallId}`);
      }

      seen.add(step.toolCallId);

      const toolCall = toolCalls.get(step.toolCallId);

      if (!toolCall) {
        logger.error(`Planner referenced unknown toolCallId: ${step.toolCallId}`);
        throw new Error(`Planner referenced unknown toolCallId: ${step.toolCallId}`);
      }

      return {
        id: step.id ?? step.toolCallId,
        toolCall,
        dependsOn: step.dependsOn ?? [],
      };
    });
  }
}
