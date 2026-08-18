import { LLM, LLMRequest, LLMResponse, Message, ToolCall } from "../../model.js";

export class OpenRouterLLM implements LLM {
  constructor(private readonly model: string) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: this.model,

        messages: request.messages.map((message) => this.mapMessage(message)),

        tools: [
          ...(request.tools ?? []).map((tool) => ({
            type: "function",

            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),

          ...(request.agents ?? []).map((agent) => ({
            type: "function",

            function: {
              name: agent.name,
              description: agent.description,
              parameters: agent.inputSchema,
            },
          })),
        ],

        temperature: request.temperature,
        max_tokens: request.maxTokens,
        top_p: request.topP,
      }),
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `OpenRouter request failed: ${response.status} ${response.statusText} - ${body}`,
      );
    }

    const data = await response.json();

    const message = data.choices?.[0]?.message;

    const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((toolCall: any) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments),
    }));

    return {
      content: message?.content ?? "",
      toolCalls,
    };
  }

  private mapMessage(message: Message): unknown {
    if (message.role === "assistant" && message.toolCalls) {
      return {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments),
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
