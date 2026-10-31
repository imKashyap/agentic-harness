import { injectable, unmanaged } from "inversify";

import { HarnessError } from "../errors/harness-error.js";
import { createLogger } from "../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "./types.js";

const logger = createLogger("OpenAILLM");

export interface OpenAIConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  defaultHeaders?: Record<string, string>;
}

@injectable()
export class OpenAILLM implements LLM {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private defaultHeaders: Record<string, string>;

  constructor(@unmanaged() config?: OpenAIConfig) {
    this.apiKey = config?.apiKey || process.env["OPENAI_API_KEY"] || "";
    this.baseURL = config?.baseURL || process.env["OPENAI_BASE_URL"] || "https://api.openai.com/v1";
    this.defaultModel = config?.defaultModel || "gpt-4o";
    this.defaultHeaders = config?.defaultHeaders || {};
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new HarnessError("OPENAI_API_KEY is not configured", "MISSING_API_KEY", 401);
    }

    const model = request.model || this.defaultModel;
    logger.info(`Sending chat request to OpenAI (model: ${model})`);

    const tokenField = request.tokenParamName ?? "max_tokens";

    const payload: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content || "",
      })),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { [tokenField]: request.maxTokens } : {}),
      ...(request.topP !== undefined ? { top_p: request.topP } : {}),
      ...(request.frequencyPenalty !== undefined
        ? { frequency_penalty: request.frequencyPenalty }
        : {}),
      ...(request.presencePenalty !== undefined
        ? { presence_penalty: request.presencePenalty }
        : {}),
      ...(request.stop ? { stop: request.stop } : {}),
      ...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
      ...(request.additionalParams ?? {}),
    };

    const res = await fetch(`${this.baseURL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...this.defaultHeaders,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new HarnessError(
        `OpenAI API request failed (${res.status}): ${errText}`,
        "UPSTREAM_API_ERROR",
        res.status,
      );
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
