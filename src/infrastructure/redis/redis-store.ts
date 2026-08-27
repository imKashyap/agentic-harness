import { injectable } from "inversify";

import { createLogger } from "../../utils/logger.js";

const logger = createLogger("RedisStore");

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

@injectable()
export class InMemoryRedisStore implements KeyValueStore {
  private data = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.data.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.data.set(key, { value, expiresAt });
    logger.debug(`Set key: ${key} (ttl: ${ttlSeconds || "none"})`);
  }

  async del(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val !== null;
  }
}
