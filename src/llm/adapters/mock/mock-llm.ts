import { createLogger } from "../../../utils/logger.js";
import { LLM, LLMRequest, LLMResponse, LLMStreamChunk } from "../../types.js";

const logger = createLogger("MockLLM");

export class MockLLM implements LLM {
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const lastMessage = request.messages.at(-1);
    const content = `Mock response to: ${lastMessage?.content ?? ""}`;
    logger.info(`MockLLM generated response for last message (role: ${lastMessage?.role})`);
    return {
      content,
    };
  }

  async *chatStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const lastMessage = request.messages.at(-1);
    const fullText = `Mock response to: ${lastMessage?.content ?? ""}`;
    logger.info(`MockLLM streaming response for last message (role: ${lastMessage?.role})`);

    const words = fullText.split(" ");
    for (let i = 0; i < words.length; i++) {
      const chunk = (i > 0 ? " " : "") + words[i];
      yield {
        type: "content",
        delta: chunk,
      };
    }

    yield {
      type: "content",
      fullResponse: {
        content: fullText,
      },
    };
  }
}
