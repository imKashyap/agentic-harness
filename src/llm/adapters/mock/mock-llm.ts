import { createLogger } from "../../../utils/logger.js";
import { LLM, LLMRequest, LLMResponse } from "../../model.js";

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
}
