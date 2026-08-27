import { injectable, unmanaged } from "inversify";

import { createLogger } from "../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "./types.js";

const logger = createLogger("AnthropicLLM");

export interface AnthropicConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

@injectable()
export class AnthropicLLM implements LLM {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;

  constructor(@unmanaged() config?: AnthropicConfig) {
    this.apiKey = config?.apiKey || process.env["ANTHROPIC_API_KEY"] || "";
    this.baseURL =
      config?.baseURL || process.env["ANTHROPIC_BASE_URL"] || "https://api.anthropic.com/v1";
    this.defaultModel = config?.defaultModel || "claude-3-5-sonnet-20241022";
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    logger.info(`Sending chat request to Anthropic (model: ${model})`);

    const systemMsg = request.messages.find((m) => m.role === "system");
    const nonSystemMsgs = request.messages.filter((m) => m.role !== "system");

    const payload = {
      model,
      system: systemMsg?.content,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content || "",
      })),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
    };

    const res = await fetch(`${this.baseURL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API request failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      content: Array<{ text: string }>;
    };
    return {
      content: data.content[0]?.text || "",
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
