export interface LLMToolDefinition {
  name: string;
  description: string;

  inputSchema: Record<string, unknown>;
}

export interface LLMSkillDefinition {
  name: string;
  description: string;
}

export interface LLMAgentDefinition {
  name: string;
  description: string;
}

export interface LLMCapabilityContext {
  tools: LLMToolDefinition[];
  skills: LLMSkillDefinition[];
  agents: LLMAgentDefinition[];
}
