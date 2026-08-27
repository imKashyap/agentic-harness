import { injectable, unmanaged } from "inversify";

import { createLogger } from "../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "./types.js";

const logger = createLogger("OpenAILLM");

export interface OpenAIConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

@injectable()
export class OpenAILLM implements LLM {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;

  constructor(@unmanaged() config?: OpenAIConfig) {
    this.apiKey = config?.apiKey || process.env["OPENAI_API_KEY"] || "";
    this.baseURL = config?.baseURL || process.env["OPENAI_BASE_URL"] || "https://api.openai.com/v1";
    this.defaultModel = config?.defaultModel || "gpt-4o";
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    logger.info(`Sending chat request to OpenAI (model: ${model})`);

    const payload = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content || "",
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
    };

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API request failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return {
      content: data.choices[0]?.message.content || "",
    };
  }

  async *chatStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const response = await this.chat(request);
    yield {
      type: "content",
      delta: response.content,
      fullResponse: response,
    };
  }
}
