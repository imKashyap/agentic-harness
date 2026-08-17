import {
    LLM,
    LLMRequest,
    LLMResponse,
} from "../../model.js";

export class OpenRouterLLM implements LLM {
    constructor(
        private readonly model: string,
    ) { }

    async chat(request: LLMRequest): Promise<LLMResponse> {
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            throw new Error(
                "OPENROUTER_API_KEY is not configured",
            );
        }

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",

                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    model: this.model,

                    messages: request.messages.map((message) => ({
                        role: message.role,
                        content: message.content,
                    })),

                    temperature: request.temperature,
                    max_tokens: request.maxTokens,
                    top_p: request.topP,
                }),
            },
        );

        if (!response.ok) {
            const body = await response.text();

            throw new Error(
                `OpenRouter request failed: ${response.status} ${response.statusText} - ${body}`,
            );
        }

        const data = await response.json();

        return {
            content:
                data.choices?.[0]?.message?.content ?? "",
        };
    }
}
