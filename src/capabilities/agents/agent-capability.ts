import { Capability } from "../capability.js";

export interface AgentCapability extends Capability {
  type: "agent";

  agentId: string;

  outputSchema?: Record<string, unknown>;
}
