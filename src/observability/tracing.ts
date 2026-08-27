import { injectable } from "inversify";

import { createLogger } from "./logging.js";

const logger = createLogger("Tracing");

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  attributes: Record<string, unknown>;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "ok" | "error";
  error?: string;
}

@injectable()
export class TracingService {
  private activeSpans = new Map<string, Span>();

  public startSpan(
    name: string,
    traceId?: string,
    parentSpanId?: string,
    attributes: Record<string, unknown> = {},
  ): Span {
    const span: Span = {
      traceId: traceId || crypto.randomUUID(),
      spanId: crypto.randomUUID(),
      parentSpanId,
      name,
      attributes,
      startTime: Date.now(),
      status: "ok",
    };
    this.activeSpans.set(span.spanId, span);
    logger.debug(`[Span Start] ${name} (traceId: ${span.traceId}, spanId: ${span.spanId})`);
    return span;
  }

  public endSpan(spanId: string, error?: Error | string): Span | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) return undefined;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;

    if (error) {
      span.status = "error";
      span.error = error instanceof Error ? error.message : String(error);
      logger.error(`[Span Error] ${span.name} failed after ${span.durationMs}ms: ${span.error}`);
    } else {
      logger.debug(`[Span End] ${span.name} completed in ${span.durationMs}ms`);
    }

    this.activeSpans.delete(spanId);
    return span;
  }

  public async traceAsync<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    traceId?: string,
    attributes: Record<string, unknown> = {},
  ): Promise<T> {
    const span = this.startSpan(name, traceId, undefined, attributes);
    try {
      const result = await fn(span);
      this.endSpan(span.spanId);
      return result;
    } catch (err) {
      this.endSpan(span.spanId, err instanceof Error ? err : String(err));
      throw err;
    }
  }
}
