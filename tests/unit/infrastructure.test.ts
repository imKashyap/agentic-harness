import assert from "node:assert";
import { describe, it } from "node:test";

import {
  PostgresCheckpointStore,
  PostgresLongTermMemoryStore,
  PostgresSessionStore,
} from "../../src/infrastructure/postgres/postgres-persistence.js";
import {
  PostgresStore,
  type RelationalDb,
} from "../../src/infrastructure/postgres/postgres-store.js";
import { RedisStore } from "../../src/infrastructure/redis/redis-store.js";
import type { Session } from "../../src/memory/types.js";

describe("PostgreSQL persistence adapters", () => {
  it("fails PostgreSQL initialization when the service is unreachable", async () => {
    const store = new PostgresStore({ host: "127.0.0.1", port: 1, connectionTimeoutMillis: 250 });
    try {
      await assert.rejects(store.initialize());
    } finally {
      await store.close();
    }
  });

  it("persists sessions through the relational database interface", async () => {
    const saved: Array<{ sql: string; params?: unknown[] }> = [];
    const session: Session = {
      id: "session-1",
      agentId: "agent-1",
      messages: [{ role: "user", content: "Hello" }],
      createdAt: 1,
      updatedAt: 1,
    };
    const db: RelationalDb = {
      async query<T>(sql: string): Promise<T[]> {
        assert.match(sql, /FROM agent_sessions/);
        return [
          {
            ...session,
            agent_id: session.agentId,
            created_at: session.createdAt,
            updated_at: session.updatedAt,
            metadata: {},
          } as T,
        ];
      },
      async execute(sql: string, params?: unknown[]): Promise<number> {
        saved.push({ sql, params });
        return 1;
      },
    };
    const store = new PostgresSessionStore(db);

    await store.save(session);
    const loaded = await store.get(session.id);

    assert.equal(loaded?.id, session.id);
    assert.equal(loaded?.agentId, session.agentId);
    assert.match(saved[0]?.sql ?? "", /INSERT INTO agent_sessions/);
  });

  it("persists checkpoints and reports status updates", async () => {
    const saved: string[] = [];
    const db: RelationalDb = {
      async query<T>(): Promise<T[]> {
        return [];
      },
      async execute(sql: string): Promise<number> {
        saved.push(sql);
        return 1;
      },
    };
    const store = new PostgresCheckpointStore(db);

    await store.save({
      id: "approval-1",
      runId: "run-1",
      agentId: "agent-1",
      taskId: "task-1",
      capability: "tool.example",
      input: { value: 1 },
      status: "pending",
      createdAt: 1,
    });
    const updated = await store.updateStatus("approval-1", "approved");

    assert.equal(updated, true);
    assert.match(saved[0] ?? "", /INSERT INTO hitl_checkpoints/);
    assert.match(saved[1] ?? "", /UPDATE hitl_checkpoints/);
  });

  it("creates memory entries without contacting external services", async () => {
    const statements: string[] = [];
    const db: RelationalDb = {
      async query<T>(): Promise<T[]> {
        return [];
      },
      async execute(sql: string): Promise<number> {
        statements.push(sql);
        return 1;
      },
    };
    const store = new PostgresLongTermMemoryStore(db);

    const memory = await store.save({
      content: "A mocked persisted fact",
      principalId: "user-1",
      scope: "user",
      agentId: "agent-1",
    });

    assert.ok(memory.id);
    assert.equal(memory.content, "A mocked persisted fact");
    assert.ok(memory.embedding?.length);
    assert.match(statements[0] ?? "", /INSERT INTO long_term_memories/);
  });
});

describe("Redis startup", () => {
  it("fails Redis initialization without retrying when the service is unreachable", async () => {
    const redis = new RedisStore({ host: "127.0.0.1", port: 1 });
    await assert.rejects(redis.initialize());
    await redis.close();
  });
});
