import { AgentConfig } from "../../core/agent/agent-config.js";

export interface AgentDefinition {
  config: AgentConfig;
  systemPrompt?: string;
}
