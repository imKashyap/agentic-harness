export interface AgentConfig {
    id: string;
    name: string;
    description?: string;

    model: ModelConfig;

    prompt: PromptConfig;

    skills: string[];
    tools: string[];
    subAgents: string[];
}

export interface ModelConfig {
    provider: string;
    model: string;

    generation?: GenerationConfig;
}

export interface GenerationConfig {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
}

export interface PromptConfig {
    id: string;
    version?: string;
}
