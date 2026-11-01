import { injectable, unmanaged } from "inversify";
import { Redis } from "ioredis";

import { createLogger } from "../../utils/logger.js";

const logger = createLogger("RedisMessageBus");

export interface MessageBus {
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: unknown) => void): Promise<() => void>;
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}

export interface RedisMessageBusOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

@injectable()
export class RedisMessageBus implements MessageBus {
  private readonly publisher: Redis;
  private readonly options: RedisMessageBusOptions;
  private readonly subscribers = new Set<Redis>();
  private initializePromise?: Promise<void>;

  constructor(@unmanaged() options: RedisMessageBusOptions = {}) {
    this.options = {
      url: options.url ?? process.env.REDIS_URL,
      host: options.host ?? process.env.REDIS_HOST ?? "localhost",
      port: options.port ?? Number(process.env.REDIS_PORT ?? 6379),
      password: options.password ?? process.env.REDIS_PASSWORD,
      db: options.db ?? Number(process.env.REDIS_DB ?? 0),
    };
    this.publisher = this.createClient();
    this.publisher.on("error", (error) => {
      logger.error(`Redis message publisher error: ${error.message}`);
    });
  }

  async initialize(): Promise<void> {
    this.initializePromise ??= this.publisher
      .connect()
      .then(() => this.publisher.ping())
      .then(() => {
        logger.info("Connected Redis message bus");
      });
    await this.initializePromise;
  }

  async publish(channel: string, message: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, handler: (message: unknown) => void): Promise<() => void> {
    const subscriber = this.createClient();
    subscriber.on("error", (error) => {
      logger.error(`Redis subscription error on '${channel}': ${error.message}`);
    });
    await subscriber.connect();
    await subscriber.subscribe(channel);
    this.subscribers.add(subscriber);
    subscriber.on("message", (receivedChannel, rawMessage) => {
      if (receivedChannel !== channel) {
        return;
      }
      try {
        handler(JSON.parse(rawMessage) as unknown);
      } catch (error) {
        logger.error(
          `Failed to decode Redis message on '${channel}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    return async () => {
      if (!this.subscribers.delete(subscriber)) {
        return;
      }
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    };
  }

  async close(): Promise<void> {
    await Promise.all([...this.subscribers].map((subscriber) => subscriber.quit()));
    this.subscribers.clear();
    if (this.publisher.status !== "end") {
      await this.publisher.quit();
    }
  }

  private createClient(): Redis {
    const clientOptions = {
      lazyConnect: true,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    };
    if (this.options.url) {
      return new Redis(this.options.url, clientOptions);
    }
    return new Redis({
      host: this.options.host,
      port: this.options.port,
      password: this.options.password,
      db: this.options.db,
      ...clientOptions,
    });
  }
}
