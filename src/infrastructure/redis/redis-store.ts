import { injectable, unmanaged } from "inversify";
import { Redis } from "ioredis";

import { createLogger } from "../../utils/logger.js";

const logger = createLogger("RedisStore");

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}

export interface RedisOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

@injectable()
export class RedisStore implements KeyValueStore {
  private readonly client: Redis;
  private initializePromise?: Promise<void>;

  constructor(@unmanaged() options: RedisOptions = {}) {
    const url = options.url ?? process.env.REDIS_URL;
    const clientOptions = {
      lazyConnect: true,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    };
    this.client = url
      ? new Redis(url, clientOptions)
      : new Redis({
          host: options.host ?? process.env.REDIS_HOST ?? "localhost",
          port: options.port ?? Number(process.env.REDIS_PORT ?? 6379),
          password: options.password ?? process.env.REDIS_PASSWORD,
          db: options.db ?? Number(process.env.REDIS_DB ?? 0),
          ...clientOptions,
        });

    this.client.on("error", (error) => {
      logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async initialize(): Promise<void> {
    this.initializePromise ??= this.client.connect().then(async () => {
      await this.client.ping();
      logger.info("Connected to Redis");
    });
    return this.initializePromise;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, "EX", ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  async del(key: string): Promise<boolean> {
    return (await this.client.del(key)) > 0;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  async close(): Promise<void> {
    if (this.client.status !== "end") {
      await this.client.quit();
    }
  }
}
