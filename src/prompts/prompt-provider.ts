export interface PromptRequest {
    id: string;
    version?: string;
}

export interface Prompt {
    id: string;
    version: string;
    content: string;
}

export interface PromptProvider {
    getPrompt(request: PromptRequest): Promise<Prompt>;
}
