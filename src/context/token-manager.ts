import { injectable } from "inversify";

import { Message } from "../llm/types.js";

export interface TokenBudgetOptions {
  maxContextTokens?: number;
  reserveOutputTokens?: number;
}

@injectable()
export class TokenManager {
  private maxContextTokens: number;
  private reserveOutputTokens: number;

  constructor() {
    this.maxContextTokens = 8192;
    this.reserveOutputTokens = 2048;
  }

  public configure(options: TokenBudgetOptions): void {
    if (options.maxContextTokens) this.maxContextTokens = options.maxContextTokens;
    if (options.reserveOutputTokens) this.reserveOutputTokens = options.reserveOutputTokens;
  }

  /**
   * Fast, reliable token estimation (averaging ~4 chars per token for English text & code).
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  public estimateMessagesTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += 4; // overhead per message
      if (typeof msg.content === "string") {
        total += this.estimateTokens(msg.content);
      }
      if (msg.toolCalls) {
        total += this.estimateTokens(JSON.stringify(msg.toolCalls));
      }
    }
    return total;
  }

  public getAvailableInputTokens(): number {
    return Math.max(1024, this.maxContextTokens - this.reserveOutputTokens);
  }
}
