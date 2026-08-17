import {
    LLM,
    Message,
} from "../../llm/model.js";

import { AgentConfig } from "./agent-config.js";
import { PromptProvider } from "../../prompts/prompt-provider.js";

export interface AgentInput {
    message: string;
}

export interface AgentResult {
    response: string;
}

export class Agent {
    constructor(
        private readonly config: AgentConfig,
        private readonly llm: LLM,
        private readonly promptProvider: PromptProvider,

    ) { }

    async run(input: AgentInput): Promise<AgentResult> {
        const prompt = await this.promptProvider.getPrompt(
            this.config.prompt,
        );

        const messages: Message[] = [
            {
                role: "system",
                content: prompt.content,
            },
            {
                role: "user",
                content: input.message,
            },
        ];

        const response = await this.llm.chat({
            messages,
        });

        return {
            response: response.content,
        };
    }
}
