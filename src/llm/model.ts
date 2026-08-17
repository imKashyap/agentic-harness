export type MessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface LLMRequest {
  messages: Message[];
}

export interface LLMResponse {
  content: string;
}

export interface LLM {
  chat(request: LLMRequest): Promise<LLMResponse>;
}
