import { createLogger } from "../observability/logging.js";
import { RetryPolicy } from "./types.js";

const logger = createLogger("Retry");

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 300,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error: unknown) => {
    if (!error) return false;
    const errObj = error as {
      statusCode?: number;
      status?: number;
      code?: string;
      message?: string;
    };
    const status = errObj.statusCode ?? errObj.status;

    // Do not retry 4xx client errors (400, 401, 403, 404, etc.) EXCEPT 429 Rate Limit
    if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
      return false;
    }

    return true;
  },
};

/**
 * Calculates exponential backoff delay with full jitter.
 */
export function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitter: boolean,
): number {
  const calculatedDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
  const cappedDelay = Math.min(calculatedDelay, maxDelayMs);

  if (!jitter) {
    return cappedDelay;
  }

  // Full jitter: random value between 0 and cappedDelay
  return Math.floor(Math.random() * (cappedDelay + 1));
}

/**
 * Executes a function with automatic retry, exponential backoff, and jitter.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  customPolicy?: Partial<RetryPolicy>,
  label: string = "Operation",
): Promise<T> {
  const policy: RetryPolicy = {
    ...DEFAULT_RETRY_POLICY,
    ...customPolicy,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt >= policy.maxRetries;
      const shouldRetry =
        !isLastAttempt && (policy.shouldRetry ? policy.shouldRetry(error, attempt) : true);

      if (!shouldRetry) {
        throw error;
      }

      const delayMs = calculateBackoffDelay(
        attempt,
        policy.initialDelayMs,
        policy.maxDelayMs,
        policy.backoffMultiplier,
        policy.jitter,
      );

      logger.warn(
        `[${label}] Attempt ${attempt + 1}/${policy.maxRetries + 1} failed. Retrying in ${delayMs}ms... Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
