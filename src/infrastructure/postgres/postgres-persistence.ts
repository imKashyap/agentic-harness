import { inject, injectable, unmanaged } from "inversify";

import type { Checkpoint as StateCheckpoint, StateStore } from "../../core/state/index.js";
import { TYPES } from "../../di/types.js";
import type { Checkpoint, CheckpointStore } from "../../hitl/types.js";
import { cosineSimilarity } from "../../memory/long-term/cosine-similarity.js";
import { LocalHashEmbeddingProvider } from "../../memory/long-term/embeddings.js";
import type { LongTermMemoryStore } from "../../memory/long-term/memory-store.js";
import type { SessionStore } from "../../memory/session/session-store.js";
import type {
  MemoryEntry,
  MemorySearchOptions,
  MemorySearchResult,
  NewMemoryEntry,
} from "../../memory/types.js";
import type { Session } from "../../memory/types.js";
import type { RelationalDb } from "./postgres-store.js";

@injectable()
export class PostgresSessionStore implements SessionStore {
  constructor(@inject(TYPES.RelationalDb) private readonly db: RelationalDb) {}

  async get(sessionId: string): Promise<Session | null> {
    const [row] = await this.db.query<SessionRow>(
      "SELECT id, agent_id, messages, metadata, created_at, updated_at FROM agent_sessions WHERE id = $1",
      [sessionId],
    );
    return row ? mapSession(row) : null;
  }

  async save(session: Session): Promise<void> {
    await this.db.execute(
      `INSERT INTO agent_sessions (id, agent_id, messages, metadata, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         agent_id = EXCLUDED.agent_id,
         messages = EXCLUDED.messages,
         metadata = EXCLUDED.metadata,
         updated_at = EXCLUDED.updated_at`,
      [
        session.id,
        session.agentId,
        JSON.stringify(session.messages),
        JSON.stringify(session.metadata ?? {}),
        session.createdAt,
        Date.now(),
      ],
    );
  }

  async delete(sessionId: string): Promise<boolean> {
    return (await this.db.execute("DELETE FROM agent_sessions WHERE id = $1", [sessionId])) > 0;
  }

  async list(agentId?: string): Promise<Session[]> {
    const rows = agentId
      ? await this.db.query<SessionRow>(
          "SELECT id, agent_id, messages, metadata, created_at, updated_at FROM agent_sessions WHERE agent_id = $1 ORDER BY updated_at DESC",
          [agentId],
        )
      : await this.db.query<SessionRow>(
          "SELECT id, agent_id, messages, metadata, created_at, updated_at FROM agent_sessions ORDER BY updated_at DESC",
        );
    return rows.map(mapSession);
  }
}

@injectable()
export class PostgresCheckpointStore implements CheckpointStore {
  constructor(@inject(TYPES.RelationalDb) private readonly db: RelationalDb) {}

  async save(checkpoint: Checkpoint): Promise<void> {
    await this.db.execute(
      `INSERT INTO hitl_checkpoints
         (id, run_id, agent_id, task_id, capability, input, status, reason, created_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         run_id = EXCLUDED.run_id,
         agent_id = EXCLUDED.agent_id,
         task_id = EXCLUDED.task_id,
         capability = EXCLUDED.capability,
         input = EXCLUDED.input,
         status = EXCLUDED.status,
         reason = EXCLUDED.reason,
         resolved_at = EXCLUDED.resolved_at`,
      [
        checkpoint.id,
        checkpoint.runId,
        checkpoint.agentId,
        checkpoint.taskId,
        checkpoint.capability,
        JSON.stringify(checkpoint.input ?? null),
        checkpoint.status,
        checkpoint.reason ?? null,
        checkpoint.createdAt,
        checkpoint.resolvedAt ?? null,
      ],
    );
  }

  async get(id: string): Promise<Checkpoint | null> {
    const [row] = await this.db.query<CheckpointRow>(
      "SELECT * FROM hitl_checkpoints WHERE id = $1",
      [id],
    );
    return row ? mapCheckpoint(row) : null;
  }

  async getByRunId(runId: string): Promise<Checkpoint | null> {
    const [row] = await this.db.query<CheckpointRow>(
      `SELECT * FROM hitl_checkpoints
       WHERE run_id = $1
       ORDER BY (status = 'pending') DESC, created_at DESC
       LIMIT 1`,
      [runId],
    );
    return row ? mapCheckpoint(row) : null;
  }

  async updateStatus(id: string, status: Checkpoint["status"], reason?: string): Promise<boolean> {
    return (
      (await this.db.execute(
        `UPDATE hitl_checkpoints
         SET status = $2, reason = $3, resolved_at = CASE WHEN $2 = 'pending' THEN NULL ELSE $4 END
         WHERE id = $1`,
        [id, status, reason ?? null, Date.now()],
      )) > 0
    );
  }

  async list(status?: Checkpoint["status"]): Promise<Checkpoint[]> {
    const rows = status
      ? await this.db.query<CheckpointRow>(
          "SELECT * FROM hitl_checkpoints WHERE status = $1 ORDER BY created_at DESC",
          [status],
        )
      : await this.db.query<CheckpointRow>(
          "SELECT * FROM hitl_checkpoints ORDER BY created_at DESC",
        );
    return rows.map(mapCheckpoint);
  }

  async delete(id: string): Promise<boolean> {
    return (await this.db.execute("DELETE FROM hitl_checkpoints WHERE id = $1", [id])) > 0;
  }
}

@injectable()
export class PostgresLongTermMemoryStore implements LongTermMemoryStore {
  private readonly embeddingProvider: LocalHashEmbeddingProvider;

  constructor(
    @inject(TYPES.RelationalDb) private readonly db: RelationalDb,
    @unmanaged() embeddingProvider?: LocalHashEmbeddingProvider,
  ) {
    this.embeddingProvider = embeddingProvider ?? new LocalHashEmbeddingProvider();
  }

  async save(entry: NewMemoryEntry): Promise<MemoryEntry> {
    const embedding = entry.embedding ?? (await this.embeddingProvider.embed(entry.content));
    const memory: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      embedding,
      createdAt: Date.now(),
    };

    await this.db.execute(
      `INSERT INTO long_term_memories
         (id, principal_id, memory_scope, agent_id, session_id, content, tags, embedding, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        memory.id,
        memory.principalId,
        memory.scope ?? "user",
        memory.agentId ?? null,
        memory.sessionId ?? null,
        memory.content,
        JSON.stringify(memory.tags ?? []),
        JSON.stringify(memory.embedding),
        JSON.stringify(memory.metadata ?? {}),
        memory.createdAt,
      ],
    );
    return memory;
  }

  async search(query: string, options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const scope = options.scope ?? "user";
    if (!options.principalId || (scope === "agent" && !options.agentId)) {
      throw new Error("Memory search requires a principal ID and an agent ID for private scope");
    }
    const params: unknown[] = [options.principalId, scope];
    const clauses: string[] = [`principal_id = $1`, `memory_scope = $2`];
    if (scope === "agent") {
      params.push(options.agentId);
      clauses.push(`agent_id = $${params.length}`);
    }
    if (options.sessionId) {
      params.push(options.sessionId);
      clauses.push(`session_id = $${params.length}`);
    }
    if (options.tags?.length) {
      params.push(JSON.stringify(options.tags));
      clauses.push(`tags ?| ARRAY(SELECT jsonb_array_elements_text($${params.length}::jsonb))`);
    }

    const rows = await this.db.query<MemoryRow>(
      `SELECT id, principal_id, memory_scope, agent_id, session_id, content, tags, embedding, metadata, created_at
       FROM long_term_memories
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY created_at DESC`,
      params,
    );
    const queryEmbedding = await this.embeddingProvider.embed(query);
    const minScore = options.minScore ?? 0;
    const scored = rows
      .map((row) => {
        const entry = mapMemory(row);
        let score = entry.embedding ? cosineSimilarity(queryEmbedding, entry.embedding) : 0;
        const words = query
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 2);
        const matches = words.filter((word) => entry.content.toLowerCase().includes(word)).length;
        if (words.length && matches) {
          score = Math.min(1, score + (0.1 * matches) / words.length);
        }
        return { entry, score };
      })
      .filter((result) => result.score >= minScore)
      .sort((left, right) => right.score - left.score);
    return scored.slice(0, options.limit ?? 5);
  }

  async delete(id: string, principalId: string): Promise<boolean> {
    if (!principalId) throw new Error("Memory deletion requires a principal ID");
    return (
      (await this.db.execute("DELETE FROM long_term_memories WHERE id = $1 AND principal_id = $2", [
        id,
        principalId,
      ])) > 0
    );
  }

  async list(
    options: Pick<MemorySearchOptions, "principalId" | "scope" | "agentId">,
  ): Promise<MemoryEntry[]> {
    const scope = options.scope ?? "user";
    if (!options.principalId || (scope === "agent" && !options.agentId)) {
      throw new Error("Memory listing requires a principal ID and an agent ID for private scope");
    }
    const params: unknown[] = [options.principalId, scope];
    const privateClause = scope === "agent" ? ` AND agent_id = $3` : "";
    if (scope === "agent") params.push(options.agentId);
    const rows = await this.db.query<MemoryRow>(
      `SELECT id, principal_id, memory_scope, agent_id, session_id, content, tags, embedding, metadata, created_at
       FROM long_term_memories WHERE principal_id = $1 AND memory_scope = $2${privateClause}
       ORDER BY created_at DESC`,
      params,
    );
    return rows.map(mapMemory);
  }
}

@injectable()
export class PostgresStateStore implements StateStore {
  constructor(@inject(TYPES.RelationalDb) private readonly db: RelationalDb) {}

  async getSession(id: string): Promise<StateStoreSession | null> {
    const [row] = await this.db.query<SessionRow>(
      "SELECT id, agent_id, messages, metadata, created_at, updated_at FROM agent_sessions WHERE id = $1",
      [id],
    );
    return row ? mapStateSession(row) : null;
  }

  async saveSession(session: StateStoreSession): Promise<void> {
    await this.db.execute(
      `INSERT INTO agent_sessions (id, agent_id, messages, metadata, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         agent_id = EXCLUDED.agent_id, messages = EXCLUDED.messages,
         metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at`,
      [
        session.id,
        session.agentId ?? null,
        JSON.stringify(session.messages),
        JSON.stringify(session.metadata ?? {}),
        session.createdAt,
        session.updatedAt,
      ],
    );
  }

  async listSessions(agentId?: string): Promise<StateStoreSession[]> {
    const rows = agentId
      ? await this.db.query<SessionRow>(
          "SELECT id, agent_id, messages, metadata, created_at, updated_at FROM agent_sessions WHERE agent_id = $1 ORDER BY updated_at DESC",
          [agentId],
        )
      : await this.db.query<SessionRow>(
          "SELECT id, agent_id, messages, metadata, created_at, updated_at FROM agent_sessions ORDER BY updated_at DESC",
        );
    return rows.map(mapStateSession);
  }

  async deleteSession(id: string): Promise<boolean> {
    return (await this.db.execute("DELETE FROM agent_sessions WHERE id = $1", [id])) > 0;
  }

  async saveCheckpoint(checkpoint: StateCheckpoint): Promise<void> {
    await this.db.execute(
      `INSERT INTO hitl_checkpoints
         (id, run_id, agent_id, task_id, capability, input, status, reason, created_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason,
         resolved_at = EXCLUDED.resolved_at`,
      [
        checkpoint.id,
        checkpoint.runId,
        checkpoint.agentId,
        checkpoint.taskId,
        checkpoint.capability,
        JSON.stringify(checkpoint.input ?? null),
        checkpoint.status,
        checkpoint.reason ?? null,
        checkpoint.createdAt,
        checkpoint.resolvedAt ?? null,
      ],
    );
  }

  async getCheckpoint(id: string): Promise<StateCheckpoint | null> {
    const [row] = await this.db.query<CheckpointRow>(
      "SELECT * FROM hitl_checkpoints WHERE id = $1",
      [id],
    );
    return row ? mapCheckpoint(row) : null;
  }

  async getPendingCheckpointByRunId(runId: string): Promise<StateCheckpoint | null> {
    const [row] = await this.db.query<CheckpointRow>(
      "SELECT * FROM hitl_checkpoints WHERE run_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [runId],
    );
    return row ? mapCheckpoint(row) : null;
  }

  async listPendingCheckpoints(): Promise<StateCheckpoint[]> {
    const rows = await this.db.query<CheckpointRow>(
      "SELECT * FROM hitl_checkpoints WHERE status = 'pending' ORDER BY created_at DESC",
    );
    return rows.map(mapCheckpoint);
  }
}

type StateStoreSession =
  Awaited<ReturnType<StateStore["getSession"]>> extends infer T ? Exclude<T, null> : never;

interface SessionRow {
  id: string;
  agent_id: string | null;
  messages: Session["messages"];
  metadata: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
}

interface CheckpointRow {
  id: string;
  run_id: string;
  agent_id: string;
  task_id: string;
  capability: string;
  input: unknown;
  status: Checkpoint["status"];
  reason: string | null;
  created_at: number;
  resolved_at: number | null;
}

interface MemoryRow {
  id: string;
  principal_id: string | null;
  memory_scope: "user" | "agent";
  agent_id: string | null;
  session_id: string | null;
  content: string;
  tags: string[] | null;
  embedding: number[] | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

function mapSession(row: SessionRow): Session {
  if (!row.agent_id) {
    throw new Error(`Session '${row.id}' is missing its agent id`);
  }
  return {
    id: row.id,
    agentId: row.agent_id,
    messages: row.messages,
    metadata: row.metadata ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapStateSession(row: SessionRow): StateStoreSession {
  return {
    id: row.id,
    agentId: row.agent_id ?? undefined,
    messages: row.messages,
    metadata: row.metadata ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapCheckpoint(row: CheckpointRow): Checkpoint {
  return {
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    taskId: row.task_id,
    capability: row.capability,
    input: row.input,
    status: row.status,
    reason: row.reason ?? undefined,
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at === null ? undefined : Number(row.resolved_at),
  };
}

function mapMemory(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    principalId: row.principal_id ?? undefined,
    scope: row.memory_scope ?? "user",
    agentId: row.agent_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    content: row.content,
    tags: row.tags ?? [],
    embedding: row.embedding ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: Number(row.created_at),
  };
}
