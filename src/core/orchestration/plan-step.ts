import { ToolCall } from "../../llm/types.js";

export interface PlanStep {
  id: string;

  toolCall: ToolCall;

  dependsOn: string[];
}
