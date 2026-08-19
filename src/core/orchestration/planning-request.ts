import { Capability } from "../../capabilities/capability.js";
import { ToolCall } from "../../llm/model.js";
import { ExecutionContext } from "../execution/execution-context.js";

export interface CapabilityCallInfo {
  toolCall: ToolCall;
  capability?: Capability;
}

export interface PlanningRequest {
  toolCalls: ToolCall[];
  context?: ExecutionContext;
  capabilities?: Capability[];
}
