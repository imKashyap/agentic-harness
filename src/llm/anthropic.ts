import { injectable, unmanaged } from "inversify";

import { HarnessError } from "../errors/harness-error.js";
import { createLogger } from "../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "./types.js";

const logger = createLogger("AnthropicLLM");

export interface AnthropicConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  defaultHeaders?: Record<string, string>;
}

@injectable()
export class AnthropicLLM implements LLM {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private defaultHeaders: Record<string, string>;

  constructor(@unmanaged() config?: AnthropicConfig) {
    this.apiKey = config?.apiKey || process.env["ANTHROPIC_API_KEY"] || "";
    this.baseURL =
      config?.baseURL || process.env["ANTHROPIC_BASE_URL"] || "https://api.anthropic.com/v1";
    this.defaultModel = config?.defaultModel || "claude-3-5-sonnet-20241022";
    this.defaultHeaders = config?.defaultHeaders || {};
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new HarnessError("ANTHROPIC_API_KEY is not configured", "MISSING_API_KEY", 401);
    }

    const model = request.model || this.defaultModel;
    logger.info(`Sending chat request to Anthropic (model: ${model})`);

    const systemMsg = request.messages.find((m) => m.role === "system");
    const nonSystemMsgs = request.messages.filter((m) => m.role !== "system");

    const payload: Record<string, unknown> = {
      model,
      system: systemMsg?.content,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content || "",
      })),
      max_tokens: request.maxTokens ?? 2048,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.topP !== undefined ? { top_p: request.topP } : {}),
      ...(request.stop ? { stop_sequences: request.stop } : {}),
      ...(request.additionalParams ?? {}),
    };

    const res = await fetch(`${this.baseURL.replace(/\/+$/, "")}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        ...this.defaultHeaders,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new HarnessError(
        `Anthropic API request failed (${res.status}): ${errText}`,
        "UPSTREAM_API_ERROR",
        res.status,
      );
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
