import { ToolCall } from "../../llm/model.js";
import { Task } from "../execution/task.js";
import { ExecutionPlan } from "./execution-plan.js";

export class Planner {
  createPlan(toolCalls: ToolCall[]): ExecutionPlan {
    const tasks: Task[] = toolCalls.map((toolCall) => ({
      id: toolCall.id,

      type: "capability",

      capability: toolCall.name,

      input: toolCall.arguments,

      status: "pending",
    }));

    return {
      id: crypto.randomUUID(),

      tasks,

      createdAt: Date.now(),
    };
  }
}
