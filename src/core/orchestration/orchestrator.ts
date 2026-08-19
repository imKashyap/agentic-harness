import { ToolCall } from "../../llm/model.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { ExecutionResult } from "../execution/execution-result.js";
import { ExecutionEngine } from "./execution-engine.js";
import { ExecutionPlan } from "./execution-plan.js";
import { Planner } from "./planner.js";

export class Orchestrator {
  constructor(
    private readonly planner: Planner,
    private readonly executionEngine: ExecutionEngine,
  ) {}

  plan(toolCalls: ToolCall[]): ExecutionPlan {
    return this.planner.createPlan(toolCalls);
  }

  async execute(plan: ExecutionPlan, context: ExecutionContext): Promise<ExecutionResult[]> {
    return this.executionEngine.execute(plan.tasks, context);
  }
}
