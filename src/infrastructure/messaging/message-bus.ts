import { EventEmitter } from "node:events";

import { injectable } from "inversify";

import { createLogger } from "../../utils/logger.js";

const logger = createLogger("MessageBus");

export interface MessageBus {
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: unknown) => void): Promise<() => void>;
}

@injectable()
export class InMemoryMessageBus implements MessageBus {
  private emitter = new EventEmitter();

  async publish(channel: string, message: unknown): Promise<void> {
    logger.debug(`Published message to channel '${channel}'`);
    this.emitter.emit(channel, message);
  }

  async subscribe(channel: string, handler: (message: unknown) => void): Promise<() => void> {
    this.emitter.on(channel, handler);
    return () => {
      this.emitter.off(channel, handler);
    };
  }
}
