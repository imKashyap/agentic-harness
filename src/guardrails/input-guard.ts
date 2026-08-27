import { injectable } from "inversify";

import { createLogger } from "../utils/logger.js";

const logger = createLogger("InputGuard");

export interface GuardResult {
  allowed: boolean;
  sanitized?: string;
  reason?: string;
}

@injectable()
export class InputGuard {
  private maxInputLength: number = 32000;
  private forbiddenPatterns: RegExp[] = [
    /ignore all previous instructions/i,
    /system override:\s*enable root/i,
  ];

  public validate(input: string): GuardResult {
    if (!input || typeof input !== "string") {
      return { allowed: false, reason: "Input must be a non-empty string" };
    }

    if (input.length > this.maxInputLength) {
      logger.warn(
        `Input rejected: length ${input.length} exceeds max length ${this.maxInputLength}`,
      );
      return {
        allowed: false,
        reason: `Input exceeds maximum length of ${this.maxInputLength} characters`,
      };
    }

    for (const pattern of this.forbiddenPatterns) {
      if (pattern.test(input)) {
        logger.warn(`Input flagged by security policy pattern: ${pattern}`);
        return { allowed: false, reason: "Input rejected due to safety policy violation" };
      }
    }

    return { allowed: true, sanitized: input.trim() };
  }
}
