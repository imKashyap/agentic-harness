import { inject, injectable, unmanaged } from "inversify";

import { TYPES } from "../di/types.js";
import { Message } from "../llm/types.js";
import { createLogger } from "../utils/logger.js";
import type { TokenManager } from "./token-manager.js";

const logger = createLogger("ContextManager");

export interface ContextOptions {
  maxMessages?: number;
  maxTokens?: number;
  preserveSystem?: boolean;
}

@injectable()
export class ContextManager {
  private defaultMaxMessages: number;

  constructor(
    @unmanaged() maxMessages: number = 20,
    @inject(TYPES.TokenManager) private tokenManager?: TokenManager,
  ) {
    this.defaultMaxMessages = maxMessages;
  }

  /**
   * Compacts conversation history while strictly preserving:
   * 1. The initial System Prompt (if present).
   * 2. Atomic Assistant `toolCalls` and corresponding Tool responses.
   * 3. The most recent conversation turns within token/message limits.
   */
  public compact(messages: Message[], options?: ContextOptions): Message[] {
    const maxMessages = options?.maxMessages ?? this.defaultMaxMessages;
    if (messages.length <= maxMessages) {
      return [...messages];
    }

    logger.info(
      `Compacting message history: ${messages.length} messages exceeds limit of ${maxMessages}`,
    );

    const hasSystem = messages.length > 0 && messages[0]?.role === "system";
    const systemMessage = hasSystem ? messages[0] : undefined;
    const tailCandidate = hasSystem ? messages.slice(1) : [...messages];

    // Take recent messages from the end
    const keptTail = tailCandidate.slice(-maxMessages);

    // If the first kept message is a tool response, we must include the prior assistant tool_calls message
    while (keptTail.length > 0 && keptTail[0]?.role === "tool") {
      const firstIndexInCandidate = tailCandidate.indexOf(keptTail[0]);
      if (firstIndexInCandidate > 0) {
        keptTail.unshift(tailCandidate[firstIndexInCandidate - 1]!);
      } else {
        keptTail.shift();
      }
    }

    const result: Message[] = [];
    if (systemMessage) {
      result.push(systemMessage);
    }
    result.push(...keptTail);

    return result;
  }
}
