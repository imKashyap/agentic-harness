import { Message } from "../../llm/types.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("ContextCompactor");

export interface CompactionOptions {
  maxMessages?: number;
  preserveSystem?: boolean;
}

export class ContextCompactor {
  constructor(private readonly defaultMaxMessages: number = 30) {}

  compact(messages: Message[], options: CompactionOptions = {}): Message[] {
    const maxMessages = options.maxMessages ?? this.defaultMaxMessages;

    if (messages.length <= maxMessages) {
      return messages;
    }

    logger.info(
      `Compacting message history: ${messages.length} messages exceeds limit of ${maxMessages}`,
    );

    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    // Target count for non-system messages
    const targetCount = systemMessage ? maxMessages - 1 : maxMessages;

    if (nonSystemMessages.length <= targetCount) {
      return messages;
    }

    // Determine initial slice index
    let startIndex = nonSystemMessages.length - targetCount;

    // Adjust startIndex to preserve atomic tool call / tool response pairs:
    // If the message at startIndex is a 'tool' response, move startIndex back until
    // we find the parent 'assistant' message that originated the toolCalls.
    while (startIndex > 0 && nonSystemMessages[startIndex]?.role === "tool") {
      startIndex--;
    }

    // If startIndex points to an assistant message with toolCalls, but some tool responses
    // would be excluded, that's already safe because moving startIndex backward includes the assistant
    // and all following tool responses up to the end.

    const prunedSlice = nonSystemMessages.slice(startIndex);

    // Final sanity check: Ensure no orphan 'tool' message exists at the very front of the slice
    let firstValidIndex = 0;
    while (firstValidIndex < prunedSlice.length && prunedSlice[firstValidIndex]?.role === "tool") {
      firstValidIndex++;
    }

    const cleanSlice = prunedSlice.slice(firstValidIndex);

    const result = systemMessage ? [systemMessage, ...cleanSlice] : cleanSlice;

    logger.debug(
      `Compaction finished: Reduced ${messages.length} -> ${result.length} messages (retained tool pair integrity)`,
    );
    return result;
  }
}
