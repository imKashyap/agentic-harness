import { injectable, unmanaged } from "inversify";

import { createLogger } from "../observability/logging.js";
import { CircuitBreakerOpenError, CircuitBreakerOptions, CircuitState } from "./types.js";

const logger = createLogger("CircuitBreaker");

export const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  label: "DefaultCircuitBreaker",
};

@injectable()
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttemptTimestamp: number = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(@unmanaged() options?: Partial<CircuitBreakerOptions>) {
    this.options = {
      ...DEFAULT_CIRCUIT_OPTIONS,
      ...options,
    };
  }

  public getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() >= this.nextAttemptTimestamp) {
      this.state = "HALF_OPEN";
      this.successCount = 0;
      logger.info(`[${this.options.label}] Reset timeout expired; transitioning to HALF_OPEN`);
    }
    return this.state;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "OPEN") {
      throw new CircuitBreakerOpenError(
        `[${this.options.label}] Circuit is OPEN. Requests blocked until ${new Date(
          this.nextAttemptTimestamp,
        ).toISOString()}`,
        this.options.label,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.successCount = 0;
        logger.info(`[${this.options.label}] Success threshold reached; transitioning to CLOSED`);
      }
    } else if (this.state === "CLOSED") {
      this.failureCount = 0;
    }
  }

  private onFailure(error: unknown): void {
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.nextAttemptTimestamp = Date.now() + this.options.resetTimeoutMs;
      logger.warn(
        `[${this.options.label}] Failure in HALF_OPEN state; returning to OPEN for ${this.options.resetTimeoutMs}ms. Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } else if (this.state === "CLOSED") {
      this.failureCount++;
      if (this.failureCount >= this.options.failureThreshold) {
        this.state = "OPEN";
        this.nextAttemptTimestamp = Date.now() + this.options.resetTimeoutMs;
        logger.warn(
          `[${this.options.label}] Failure threshold (${this.options.failureThreshold}) reached; tripping to OPEN for ${this.options.resetTimeoutMs}ms. Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTimestamp = 0;
  }
}
