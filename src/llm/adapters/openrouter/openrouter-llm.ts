import { HarnessError } from "../../../errors/harness-error.js";
import { createLogger } from "../../../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk, Message, ToolCall } from "../../types.js";

const logger = createLogger("OpenRouterLLM");

export class OpenRouterLLM implements LLM {
  constructor(private readonly model: string) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      logger.error("OPENROUTER_API_KEY is not configured in environment");
      throw new HarnessError("OPENROUTER_API_KEY is not configured", "MISSING_API_KEY", 401);
    }

    const effectiveModel = request.model ?? this.model;
    const toolDefinitions = this.buildToolDefinitions(request);

    const payload: Record<string, unknown> = {
      model: effectiveModel,
      messages: request.messages.map((message) => this.mapMessage(message)),
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.topP !== undefined ? { top_p: request.topP } : {}),
    };

    logger.info(
      `Sending chat request to OpenRouter (model: ${effectiveModel}, messages: ${request.messages.length}, tools: ${toolDefinitions.length})`,
    );

    const startTime = Date.now();
    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Network error connecting to OpenRouter: ${errorMessage}`);
      throw new HarnessError(`OpenRouter network error: ${errorMessage}`, "NETWORK_ERROR", 502);
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
      }>;
      error?: unknown;
    };

    if (data.error) {
      logger.error(`OpenRouter returned API error: ${JSON.stringify(data.error)}`);
      throw new HarnessError(
        `OpenRouter API error: ${JSON.stringify(data.error)}`,
        "PROVIDER_ERROR",
        502,
      );
    }

    const choice = data.choices?.[0];
    if (!choice) {
      logger.error(`OpenRouter returned no choices in response: ${JSON.stringify(data)}`);
      throw new HarnessError(
        "OpenRouter response contained no choices",
        "EMPTY_CHOICES_ERROR",
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
  }

  async *chatStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new HarnessError("OPENROUTER_API_KEY is not configured", "MISSING_API_KEY", 401);
    }

    const effectiveModel = request.model ?? this.model;
    const toolDefinitions = this.buildToolDefinitions(request);

    const payload: Record<string, unknown> = {
      model: effectiveModel,
      messages: request.messages.map((message) => this.mapMessage(message)),
      stream: true,
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.topP !== undefined ? { top_p: request.topP } : {}),
    };

    logger.info(`Starting streaming chat with OpenRouter (model: ${effectiveModel})`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        "STREAMING_ERROR",
        response.status,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedContent = "";
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
            continue;
          }

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(dataStr) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
              }>;
            };

            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              accumulatedContent += delta.content;
              yield {
                type: "content",
                delta: delta.content,
              };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallsMap.get(tc.index) ?? { id: "", name: "", arguments: "" };
                if (tc.id) {
                  existing.id = tc.id;
                }
                if (tc.function?.name) {
                  existing.name += tc.function.name;
                }
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
                toolCallsMap.set(tc.index, existing);
              }
            }
          } catch {
            // ignore partial json chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const finalToolCalls: ToolCall[] = Array.from(toolCallsMap.values()).map((tc) => {
      let parsedArgs: unknown = {};
      try {
        parsedArgs = JSON.parse(tc.arguments);
      } catch {
        parsedArgs = tc.arguments;
      }
      return {
        id: tc.id || crypto.randomUUID(),
        name: tc.name,
        arguments: parsedArgs,
      };
    });

    yield {
      type: "content",
      fullResponse: {
        content: accumulatedContent,
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      },
    };
  }

  private buildToolDefinitions(request: LLMRequest): Array<Record<string, unknown>> {
    return [
      ...(request.tools ?? []).map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
      ...(request.agents ?? []).map((agent) => ({
        type: "function" as const,
        function: {
          name: agent.name,
          description: agent.description,
          parameters: agent.inputSchema,
        },
      })),
    ];
  }

  private mapMessage(message: Message): Record<string, unknown> {
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments:
              typeof toolCall.arguments === "string"
                ? toolCall.arguments
                : JSON.stringify(toolCall.arguments ?? {}),
          },
        })),
      };
    }

    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content ?? "",
      };
    }

    return {
      role: message.role,
      content: message.content ?? "",
    };
  }
}
