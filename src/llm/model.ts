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

export interface LLMRequest {
  messages: Message[];

  tools?: ToolDefinition[];

  model?: string;

  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface LLM {
  chat(request: LLMRequest): Promise<LLMResponse>;
}
