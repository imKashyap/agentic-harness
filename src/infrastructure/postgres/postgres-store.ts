import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { injectable, unmanaged } from "inversify";
import pg from "pg";

import { createLogger } from "../../utils/logger.js";

const { Pool } = pg;
const logger = createLogger("PostgresStore");

export interface RelationalDb {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
  initialize?(): Promise<void>;
  close?(): Promise<void>;
}

export interface PostgresOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  schemaPath?: string;
}

@injectable()
export class PostgresStore implements RelationalDb {
  private readonly pool: pg.Pool;
  private readonly schemaPath: string;
  private initializePromise?: Promise<void>;

  constructor(@unmanaged() options: PostgresOptions = {}) {
    const connectionString = options.connectionString ?? process.env.DATABASE_URL;
    this.schemaPath = resolve(options.schemaPath ?? "src/llm/configuration/postgres-schema.sql");

    this.pool = new Pool(
      connectionString
        ? {
            connectionString,
            max: options.max ?? 10,
            idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
            connectionTimeoutMillis: options.connectionTimeoutMillis ?? 2_000,
          }
        : {
            host: options.host ?? process.env.POSTGRES_HOST ?? "localhost",
            port: options.port ?? Number(process.env.POSTGRES_PORT ?? 5432),
            database: options.database ?? process.env.POSTGRES_DB ?? "agentic_harness",
            user: options.user ?? process.env.POSTGRES_USER ?? "harness",
            password: options.password ?? process.env.POSTGRES_PASSWORD,
            max: options.max ?? 10,
            idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
            connectionTimeoutMillis: options.connectionTimeoutMillis ?? 2_000,
          },
    );

    this.pool.on("error", (error) => {
      logger.error(`Unexpected PostgreSQL pool error: ${error.message}`);
    });
  }

  async initialize(): Promise<void> {
    this.initializePromise ??= this.initializeDatabase();
    return this.initializePromise;
  }

  private async initializeDatabase(): Promise<void> {
    await this.pool.query("SELECT 1");
    const schema = await readFile(this.schemaPath, "utf-8");
    await this.pool.query(schema);
    logger.info(`Connected to PostgreSQL and initialized schema from '${this.schemaPath}'`);
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<number> {
    const result = await this.pool.query(sql, params);
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
