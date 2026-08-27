export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface TimeoutPolicy {
  timeoutMs: number;
  label?: string;
}

export interface FallbackPolicy<T> {
  primary: () => Promise<T>;
  fallback: (error: unknown) => Promise<T>;
  shouldFallback?: (error: unknown) => boolean;
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of consecutive failures before opening circuit
  resetTimeoutMs: number; // Duration in OPEN state before trying HALF_OPEN
  successThreshold: number; // Number of consecutive successes in HALF_OPEN to close circuit
  label?: string;
}

export class TimeoutError extends Error {
  constructor(
    message: string = "Operation timed out",
    public readonly timeoutMs?: number,
  ) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(
    message: string = "Circuit breaker is open",
    public readonly label?: string,
  ) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}
