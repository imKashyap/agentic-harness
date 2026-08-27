import { createLogger } from "../observability/logging.js";
import { FallbackPolicy } from "./types.js";

const logger = createLogger("Fallback");

/**
 * Executes a primary operation and switches to fallback if primary throws an error.
 */
export async function withFallback<T>(
  policy: FallbackPolicy<T>,
  label: string = "Operation",
): Promise<T> {
  try {
    return await policy.primary();
  } catch (error) {
    const shouldFallback = policy.shouldFallback ? policy.shouldFallback(error) : true;

    if (!shouldFallback) {
      throw error;
    }

    logger.warn(
      `[${label}] Primary execution failed, executing fallback strategy. Reason: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return await policy.fallback(error);
  }
}
