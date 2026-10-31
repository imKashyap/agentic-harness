import { HarnessError } from "../../../errors/harness-error.js";
import { withRetry, withTimeout } from "../../../resilience/index.js";
import { createLogger } from "../../../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk, Message, ToolCall } from "../../types.js";

const logger = createLogger("OpenRouterLLM");

export interface OpenRouterOptions {
  model?: string;
  baseURL?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class OpenRouterLLM implements LLM {
  private readonly model: string;
  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(modelOrOptions: string | OpenRouterOptions = "google/gemini-2.0-flash-001") {
    if (typeof modelOrOptions === "string") {
      this.model = modelOrOptions;
      this.baseURL = "https://openrouter.ai/api/v1";
      this.timeoutMs = 60000;
      this.maxRetries = 3;
    } else {
      this.model = modelOrOptions.model ?? "google/gemini-2.0-flash-001";
      this.baseURL = modelOrOptions.baseURL ?? "https://openrouter.ai/api/v1";
      this.apiKey = modelOrOptions.apiKey;
      this.timeoutMs = modelOrOptions.timeoutMs ?? 60000;
      this.maxRetries = modelOrOptions.maxRetries ?? 3;
    }
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.apiKey || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      logger.error("OPENROUTER_API_KEY is not configured in environment");
      throw new HarnessError("OPENROUTER_API_KEY is not configured", "MISSING_API_KEY", 401);
    }

    const effectiveModel = request.model ?? this.model;
    const toolDefinitions = this.buildToolDefinitions(request);
    const tokenField = request.tokenParamName ?? "max_tokens";

    const payload: Record<string, unknown> = {
      model: effectiveModel,
      messages: request.messages.map((message) => this.mapMessage(message)),
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
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

    logger.info(
      `Sending chat request to OpenRouter (model: ${effectiveModel}, messages: ${request.messages.length}, tools: ${toolDefinitions.length})`,
    );

    return withRetry(
      async () => {
        return withTimeout(
          async (signal) => {
            const startTime = Date.now();
            let response: Response;
            try {
              response = await fetch(`${this.baseURL.replace(/\/+$/, "")}/chat/completions`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
                signal,
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.error(`Network error connecting to OpenRouter: ${errorMessage}`);
              throw new HarnessError(
                `OpenRouter network error: ${errorMessage}`,
                "NETWORK_ERROR",
                502,
              );
            }

            const latencyMs = Date.now() - startTime;

            if (!response.ok) {
              const body = await response.text();
              const errorMessage = `OpenRouter request failed [${response.status} ${response.statusText}] in ${latencyMs}ms: ${body}`;
              logger.error(errorMessage);
              throw new HarnessError(errorMessage, "UPSTREAM_API_ERROR", response.status);
            }

            const data = (await response.json()) as {
              choices?: Array<{
                message?: {
                  content?: string | null;
                  tool_calls?: Array<{
                    id: string;
                    type: string;
                    function: {
                      name: string;
                      arguments: string | unknown;
                    };
                  }>;
                };
                finish_reason?: string;
              }>;
              usage?: {
                prompt_tokens: number;
                completion_tokens: number;
                total_tokens: number;
              };
            };

            const choice = data.choices?.[0];
            if (!choice) {
              logger.error("OpenRouter returned empty choices array");
              throw new HarnessError(
                "OpenRouter returned no response choices",
                "EMPTY_RESPONSE",
                502,
              );
            }

            const message = choice.message;

            const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((toolCall) => {
              let parsedArgs: unknown = {};
              if (typeof toolCall.function?.arguments === "string") {
                try {
                  parsedArgs = JSON.parse(toolCall.function.arguments);
                } catch {
                  parsedArgs = toolCall.function.arguments;
                }
              } else if (toolCall.function?.arguments) {
                parsedArgs = toolCall.function.arguments;
              }

              return {
                id: toolCall.id,
                name: toolCall.function?.name ?? "",
                arguments: parsedArgs,
              };
            });

            const content = message?.content ?? "";
            logger.info(
              `OpenRouter response received in ${latencyMs}ms (content length: ${content.length}, toolCalls: ${toolCalls.length})`,
            );

            return {
              content,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            };
          },
          this.timeoutMs,
          `OpenRouter chat (${effectiveModel})`,
        );
      },
      { maxRetries: this.maxRetries },
      `OpenRouter chat (${effectiveModel})`,
    );
  }

  async *chatStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = this.apiKey || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new HarnessError("OPENROUTER_API_KEY is not configured", "MISSING_API_KEY", 401);
    }

    const effectiveModel = request.model ?? this.model;
    const toolDefinitions = this.buildToolDefinitions(request);
    const tokenField = request.tokenParamName ?? "max_tokens";

    const payload: Record<string, unknown> = {
      model: effectiveModel,
      messages: request.messages.map((message) => this.mapMessage(message)),
      stream: true,
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
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

    logger.info(`Starting streaming chat with OpenRouter (model: ${effectiveModel})`);

    const response = await fetch(`${this.baseURL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new HarnessError(
        `OpenRouter streaming failed [${response.status}]: ${errorText}`,
        "UPSTREAM_API_ERROR",
        response.status,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullContent = "";
    const collectedToolCalls: Map<number, { id: string; name: string; arguments: string }> =
      new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") {
            continue;
          }

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const data = JSON.parse(jsonStr) as {
                choices?: Array<{
                  delta?: {
                    content?: string | null;
                    tool_calls?: Array<{
                      index: number;
                      id?: string;
                      type?: string;
                      function?: {
                        name?: string;
                        arguments?: string;
                      };
                    }>;
                  };
                }>;
              };

              const delta = data.choices?.[0]?.delta;
              if (!delta) continue;

              // Text chunk
              if (delta.content) {
                fullContent += delta.content;
                yield {
                  type: "content",
                  delta: delta.content,
                };
              }

              // Tool call streaming chunk
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const existing = collectedToolCalls.get(tc.index) ?? {
                    id: tc.id ?? `call_${tc.index}`,
                    name: "",
                    arguments: "",
                  };

                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name += tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;

                  collectedToolCalls.set(tc.index, existing);
                }
              }
            } catch (err) {
              logger.debug(`Error parsing SSE data chunk: ${String(err)}`);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Final assembled ToolCalls
    const finalToolCalls: ToolCall[] = [];
    for (const [, tc] of collectedToolCalls.entries()) {
      let parsedArgs: unknown = {};
      try {
        parsedArgs = JSON.parse(tc.arguments);
      } catch {
        parsedArgs = tc.arguments;
      }
      finalToolCalls.push({
        id: tc.id,
        name: tc.name,
        arguments: parsedArgs,
      });
    }

    yield {
      type: "content",
      delta: "",
      fullResponse: {
        content: fullContent,
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      },
    };
  }

  private mapMessage(message: Message): Record<string, unknown> {
    const mapped: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };

    if (message.toolCalls && message.toolCalls.length > 0) {
      mapped["tool_calls"] = message.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
        },
      }));
    }

    if (message.toolCallId) {
      mapped["tool_call_id"] = message.toolCallId;
    }

    return mapped;
  }

  private buildToolDefinitions(request: LLMRequest): Array<Record<string, unknown>> {
    const definitions: Array<Record<string, unknown>> = [];

    if (request.tools) {
      for (const tool of request.tools) {
        definitions.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        });
      }
    }

    if (request.agents) {
      for (const agent of request.agents) {
        definitions.push({
          type: "function",
          function: {
            name: agent.name,
            description: agent.description,
            parameters: {
              type: "object",
              properties: {
                task: {
                  type: "string",
                  description: "The specific task or prompt to delegate to this sub-agent.",
                },
              },
              required: ["task"],
            },
          },
        });
      }
    }

    return definitions;
  }
}
