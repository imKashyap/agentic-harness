export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: MessageRole;
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  agents?: AgentDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tokenParamName?: "max_tokens" | "max_completion_tokens";
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  reasoningEffort?: "low" | "medium" | "high";
  additionalParams?: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface LLMStreamChunk {
  type: "content" | "tool_call" | "thought";
  delta?: string;
  toolCallDelta?: Partial<ToolCall>;
  fullResponse?: LLMResponse;
}

export interface LLM {
  chat(request: LLMRequest): Promise<LLMResponse>;
  chatStream?(request: LLMRequest): AsyncIterable<LLMStreamChunk>;
}
