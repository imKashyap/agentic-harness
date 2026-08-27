import { inject, injectable, unmanaged } from "inversify";

import { TYPES } from "../di/types.js";
import { Message } from "../llm/types.js";
import { createLogger } from "../utils/logger.js";
import type { MemoryManager } from "./memory.js";

const logger = createLogger("PromptBuilder");

export interface PromptSection {
  title?: string;
  content: string;
}

@injectable()
export class PromptBuilder {
  private basePrompt: string;
  private sections: PromptSection[] = [];

  constructor(
    @unmanaged() basePrompt: string = "",
    @inject(TYPES.MemoryManager) private memoryManager?: MemoryManager,
  ) {
    this.basePrompt = basePrompt;
  }

  public setBasePrompt(prompt: string): this {
    this.basePrompt = prompt;
    return this;
  }

  public addSection(content: string, title?: string): this {
    this.sections.push({ content, title });
    return this;
  }

  /**
   * Injects recalled semantic memories into the system prompt context.
   */
  public async injectRelevantMemories(
    query: string,
    agentId?: string,
    limit: number = 3,
  ): Promise<this> {
    if (!this.memoryManager || !query) return this;

    try {
      const memories = await this.memoryManager.recall(query, { agentId, limit, minScore: 0.0 });
      if (memories.length > 0) {
        const memoryContent = memories
          .map((m, idx) => `[Fact ${idx + 1}] ${m.entry.content}`)
          .join("\n");
        this.addSection(`Relevant long-term memories:\n${memoryContent}`, "Context & Facts");
        logger.debug(`Injected ${memories.length} recalled memories for query '${query}'`);
      }
    } catch (err) {
      logger.warn(`Failed to recall memories during prompt build: ${String(err)}`);
    }

    return this;
  }

  public buildSystemPrompt(): string {
    const parts: string[] = [];
    if (this.basePrompt) {
      parts.push(this.basePrompt);
    }
    for (const section of this.sections) {
      if (section.title) {
        parts.push(`### ${section.title}\n${section.content}`);
      } else {
        parts.push(section.content);
      }
    }
    return parts.join("\n\n");
  }

  public buildMessages(userPrompt: string, history: Message[] = []): Message[] {
    const systemPrompt = this.buildSystemPrompt();
    const messages: Message[] = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    messages.push(...history);
    messages.push({ role: "user", content: userPrompt });

    return messages;
  }
}
