import { createLogger } from "../../../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, Message, ToolCall } from "../../model.js";

const logger = createLogger("OpenRouterLLM");

export class OpenRouterLLM implements LLM {
  constructor(private readonly model: string) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      logger.error("OPENROUTER_API_KEY is not configured in environment");
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const effectiveModel = request.model ?? this.model;

    const toolDefinitions = [
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
      throw new Error(`OpenRouter network error: ${errorMessage}`);
    }

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const body = await response.text();
      const errorMessage = `OpenRouter request failed [${response.status} ${response.statusText}] in ${latencyMs}ms: ${body}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
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
      throw new Error(`OpenRouter API error: ${JSON.stringify(data.error)}`);
    }

    const choice = data.choices?.[0];
    if (!choice) {
      logger.error(`OpenRouter returned no choices in response: ${JSON.stringify(data)}`);
      throw new Error("OpenRouter response contained no choices");
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
