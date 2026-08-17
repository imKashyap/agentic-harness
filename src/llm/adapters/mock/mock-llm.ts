import {
  LLM,
  LLMRequest,
  LLMResponse,
} from "../../model.js";

export class MockLLM implements LLM {
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const lastMessage = request.messages.at(-1);

    return {
      content: `Mock response to: ${lastMessage?.content ?? ""}`,
    };
  }
}
