import { injectable } from "inversify";

import { GuardResult } from "./input-guard.js";

@injectable()
export class OutputGuard {
  private piiPatterns: Array<{ pattern: RegExp; replacement: string }> = [
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g,
      replacement: "[REDACTED_EMAIL]",
    },
    { pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, replacement: "[REDACTED_CARD]" },
  ];

  public sanitize(output: string, enableRedaction: boolean = false): GuardResult {
    if (!output || typeof output !== "string") {
      return { allowed: true, sanitized: "" };
    }

    let processed = output;
    if (enableRedaction) {
      for (const { pattern, replacement } of this.piiPatterns) {
        processed = processed.replace(pattern, replacement);
      }
    }

    return { allowed: true, sanitized: processed };
  }
}
