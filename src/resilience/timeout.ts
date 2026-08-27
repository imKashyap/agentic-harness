import { TimeoutError } from "./types.js";

/**
 * Wraps an async function or Promise with a timeout.
 * Accepts an optional AbortSignal to propagate cancellation.
 */
export async function withTimeout<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string = "Operation",
): Promise<T> {
  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
    return fn();
  }

  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(`${label} timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(controller.signal), timeoutPromise]);
    return result;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
