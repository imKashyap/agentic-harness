import { EventEmitter } from "node:events";

import { injectable } from "inversify";

import { createLogger } from "../utils/logger.js";
import { HarnessEvent, HarnessEventMap, HarnessEventType } from "./types.js";

const logger = createLogger("HarnessEventBus");

@injectable()
export class HarnessEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit<T extends HarnessEventType>(type: T, payload: HarnessEventMap[T]): void {
    logger.debug(`Emitting event '${type}' (runId: ${payload.runId})`);
    this.emitter.emit(type, payload);
    this.emitter.emit("*", { type, payload } as HarnessEvent);
  }

  on<T extends HarnessEventType>(
    type: T,
    listener: (payload: HarnessEventMap[T]) => void,
  ): () => void {
    this.emitter.on(type, listener);
    return () => this.off(type, listener);
  }

  once<T extends HarnessEventType>(type: T, listener: (payload: HarnessEventMap[T]) => void): void {
    this.emitter.once(type, listener);
  }

  off<T extends HarnessEventType>(type: T, listener: (payload: HarnessEventMap[T]) => void): void {
    this.emitter.off(type, listener);
  }

  onAny(listener: (event: HarnessEvent) => void): () => void {
    this.emitter.on("*", listener);
    return () => this.emitter.off("*", listener);
  }

  /**
   * Subscribes to all events for a specific runId as an async stream.
   * Completes when `run:end` or `run:error` is received.
   */
  async *subscribeToRun(runId: string): AsyncIterable<HarnessEvent> {
    const queue: HarnessEvent[] = [];
    let resolveNext: ((value: HarnessEvent | null) => void) | null = null;
    let isFinished = false;

    const listener = (event: HarnessEvent): void => {
      if (event.payload.runId !== runId) {
        return;
      }

      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve(event);
      } else {
        queue.push(event);
      }

      if (event.type === "run:end" || event.type === "run:error") {
        isFinished = true;
      }
    };

    const unsubscribe = this.onAny(listener);

    try {
      while (!isFinished || queue.length > 0) {
        if (queue.length > 0) {
          const item = queue.shift()!;
          yield item;
          if (item.type === "run:end" || item.type === "run:error") {
            break;
          }
        } else {
          const event = await new Promise<HarnessEvent | null>((resolve) => {
            resolveNext = resolve;
          });

          if (!event) {
            break;
          }

          yield event;

          if (event.type === "run:end" || event.type === "run:error") {
            break;
          }
        }
      }
    } finally {
      unsubscribe();
    }
  }
}
