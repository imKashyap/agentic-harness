export class HarnessError extends Error {
  constructor(
    message: string,
    public readonly code: string = "HARNESS_ERROR",
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
