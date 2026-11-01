import type { HarnessOptions } from "../../src/core/harness.js";
import type { StateStore } from "../../src/core/state/state-store.js";
import type { Checkpoint, CheckpointStore } from "../../src/hitl/types.js";
import type { MessageBus } from "../../src/infrastructure/messaging/message-bus.js";
import type { RelationalDb } from "../../src/infrastructure/postgres/postgres-store.js";
import type { KeyValueStore } from "../../src/infrastructure/redis/redis-store.js";
import { cosineSimilarity } from "../../src/memory/long-term/cosine-similarity.js";
import { LocalHashEmbeddingProvider } from "../../src/memory/long-term/embeddings.js";
import type { LongTermMemoryStore } from "../../src/memory/long-term/memory-store.js";
import type { SessionStore } from "../../src/memory/session/session-store.js";
import type {
  MemoryEntry,
  MemorySearchOptions,
  MemorySearchResult,
  NewMemoryEntry,
  Session,
} from "../../src/memory/types.js";

export class MockSessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async list(agentId?: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((session) => !agentId || session.agentId === agentId);
  }
}

export class MockCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<string, Checkpoint>();

  async save(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  async get(id: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(id) ?? null;
  }

  async getByRunId(runId: string): Promise<Checkpoint | null> {
    return (
      [...this.checkpoints.values()].find(
        (item) => item.runId === runId && item.status === "pending",
      ) ??
      [...this.checkpoints.values()].find((item) => item.runId === runId) ??
      null
    );
  }

  async updateStatus(id: string, status: Checkpoint["status"], reason?: string): Promise<boolean> {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) return false;
    checkpoint.status = status;
    checkpoint.reason = reason;
    checkpoint.resolvedAt = Date.now();
    return true;
  }

  async list(status?: Checkpoint["status"]): Promise<Checkpoint[]> {
    return [...this.checkpoints.values()].filter((item) => !status || item.status === status);
  }

  async delete(id: string): Promise<boolean> {
    return this.checkpoints.delete(id);
  }
}

export class MockStateStore implements StateStore {
  private readonly sessions = new Map<string, Awaited<ReturnType<StateStore["getSession"]>>>();
  private readonly checkpoints = new Map<string, Checkpoint>();

  async getSession(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async saveSession(session: NonNullable<Awaited<ReturnType<StateStore["getSession"]>>>) {
    this.sessions.set(session.id, session);
  }

  async listSessions(agentId?: string) {
    return [...this.sessions.values()].filter(
      (session): session is NonNullable<typeof session> =>
        !!session && (!agentId || session.agentId === agentId),
    );
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(id) ?? null;
  }

  async getPendingCheckpointByRunId(runId: string): Promise<Checkpoint | null> {
    return (
      [...this.checkpoints.values()].find(
        (checkpoint) => checkpoint.runId === runId && checkpoint.status === "pending",
      ) ?? null
    );
  }

  async listPendingCheckpoints(): Promise<Checkpoint[]> {
    return this.listCheckpoints("pending");
  }

  private listCheckpoints(status: Checkpoint["status"]): Checkpoint[] {
    return [...this.checkpoints.values()].filter((checkpoint) => checkpoint.status === status);
  }
}

export class MockLongTermMemoryStore implements LongTermMemoryStore {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly embeddings = new LocalHashEmbeddingProvider();

  async save(entry: NewMemoryEntry): Promise<MemoryEntry> {
    const memory: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      embedding: entry.embedding ?? (await this.embeddings.embed(entry.content)),
      createdAt: Date.now(),
    };
    this.entries.set(memory.id, memory);
    return memory;
  }

  async search(query: string, options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const queryEmbedding = await this.embeddings.embed(query);
    return [...this.entries.values()]
      .filter((entry) => entry.principalId === options.principalId)
      .filter((entry) => (entry.scope ?? "user") === (options.scope ?? "user"))
      .filter((entry) => options.scope !== "agent" || entry.agentId === options.agentId)
      .filter((entry) => !options.sessionId || entry.sessionId === options.sessionId)
      .filter(
        (entry) => !options.tags?.length || options.tags.some((tag) => entry.tags?.includes(tag)),
      )
      .map((entry) => ({
        entry,
        score: entry.embedding ? cosineSimilarity(queryEmbedding, entry.embedding) : 0,
      }))
      .filter((result) => result.score >= (options.minScore ?? 0))
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit ?? 5);
  }

  async delete(id: string, principalId: string): Promise<boolean> {
    const entry = this.entries.get(id);
    return entry?.principalId === principalId ? this.entries.delete(id) : false;
  }

  async list(
    options: Pick<MemorySearchOptions, "principalId" | "scope" | "agentId">,
  ): Promise<MemoryEntry[]> {
    return [...this.entries.values()]
      .filter((entry) => entry.principalId === options.principalId)
      .filter((entry) => (entry.scope ?? "user") === (options.scope ?? "user"))
      .filter((entry) => options.scope !== "agent" || entry.agentId === options.agentId);
  }
}

export class MockRelationalDb implements RelationalDb {
  version = 1;
  readonly statements: Array<{ sql: string; params?: unknown[] }> = [];

  async initialize(): Promise<void> {}

  async query<T>(sql: string): Promise<T[]> {
    this.statements.push({ sql });
    if (sql.includes("WITH next_version")) {
      this.version += 1;
      return [{ version: this.version } as T];
    }
    if (sql.includes("llm_config_version_state")) {
      return [{ version: this.version } as T];
    }
    return [];
  }

  async execute(sql: string, params?: unknown[]): Promise<number> {
    this.statements.push({ sql, params });
    return 1;
  }
}

export class MockKeyValueStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async del(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.values.has(key);
  }
}

export class MockMessageBus implements MessageBus {
  private readonly handlers = new Map<string, Set<(message: unknown) => void>>();

  async publish(channel: string, message: unknown): Promise<void> {
    for (const handler of this.handlers.get(channel) ?? []) handler(message);
  }

  async subscribe(channel: string, handler: (message: unknown) => void): Promise<() => void> {
    const handlers = this.handlers.get(channel) ?? new Set();
    handlers.add(handler);
    this.handlers.set(channel, handlers);
    return () => handlers.delete(handler);
  }
}

export function withMockPersistence(options: HarnessOptions = {}): HarnessOptions {
  return {
    relationalDb: new MockRelationalDb(),
    keyValueStore: new MockKeyValueStore(),
    messageBus: new MockMessageBus(),
    sessionStore: new MockSessionStore(),
    longTermMemoryStore: new MockLongTermMemoryStore(),
    checkpointStore: new MockCheckpointStore(),
    ...options,
  };
}
