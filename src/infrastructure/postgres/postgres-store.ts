import { injectable } from "inversify";

import { createLogger } from "../../utils/logger.js";

const logger = createLogger("PostgresStore");

export interface RelationalDb {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
}

@injectable()
export class MockPostgresStore implements RelationalDb {
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    logger.debug(`[Mock Postgres Query] ${sql} (params: ${JSON.stringify(params || [])})`);
    return [];
  }

  async execute(sql: string, params?: unknown[]): Promise<number> {
    logger.debug(`[Mock Postgres Exec] ${sql} (params: ${JSON.stringify(params || [])})`);
    return 1;
  }
}
