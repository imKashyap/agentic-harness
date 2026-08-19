import { ToolCall } from "../../llm/model.js";

export interface PlanStep {
  id: string;

  toolCall: ToolCall;

  dependsOn: string[];
}
