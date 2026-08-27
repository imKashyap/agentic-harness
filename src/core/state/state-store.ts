import { promises as fs } from "node:fs";
import * as path from "node:path";

import { injectable, unmanaged } from "inversify";

import { createLogger } from "../../utils/logger.js";
import type { Session } from "./conversation-state.js";
import type { Checkpoint } from "./run-state.js";

const logger = createLogger("StateStore");

export interface StateStore {
  // Session methods
  getSession(id: string): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;
  listSessions(agentId?: string): Promise<Session[]>;
  deleteSession(id: string): Promise<boolean>;

  // Checkpoint methods
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  getCheckpoint(id: string): Promise<Checkpoint | null>;
  getPendingCheckpointByRunId(runId: string): Promise<Checkpoint | null>;
  listPendingCheckpoints(): Promise<Checkpoint[]>;
}

@injectable()
export class InMemoryStateStore implements StateStore {
  private sessions = new Map<string, Session>();
  private checkpoints = new Map<string, Checkpoint>();

  async getSession(id: string): Promise<Session | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    return JSON.parse(JSON.stringify(session));
  }

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.id, JSON.parse(JSON.stringify(session)));
  }

  async listSessions(agentId?: string): Promise<Session[]> {
    const all = Array.from(this.sessions.values()).map((s) => JSON.parse(JSON.stringify(s)));
    if (agentId) {
      return all.filter((s) => s.agentId === agentId);
    }
    return all;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, JSON.parse(JSON.stringify(checkpoint)));
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    const cp = this.checkpoints.get(id);
    if (!cp) return null;
    return JSON.parse(JSON.stringify(cp));
  }

  async getPendingCheckpointByRunId(runId: string): Promise<Checkpoint | null> {
    for (const cp of this.checkpoints.values()) {
      if (cp.runId === runId && cp.status === "pending") {
        return JSON.parse(JSON.stringify(cp));
      }
    }
    return null;
  }

  async listPendingCheckpoints(): Promise<Checkpoint[]> {
    return Array.from(this.checkpoints.values())
      .filter((cp) => cp.status === "pending")
      .map((cp) => JSON.parse(JSON.stringify(cp)));
  }
}

@injectable()
export class FileStateStore implements StateStore {
  private memoryFallback = new InMemoryStateStore();
  private baseDir: string;

  constructor(@unmanaged() baseDir: string = "./data/state") {
    this.baseDir = path.resolve(baseDir);
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(path.join(this.baseDir, "sessions"), { recursive: true });
    await fs.mkdir(path.join(this.baseDir, "checkpoints"), { recursive: true });
  }

  async getSession(id: string): Promise<Session | null> {
    try {
      const filePath = path.join(this.baseDir, "sessions", `${id}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as Session;
    } catch {
      return this.memoryFallback.getSession(id);
    }
  }

  async saveSession(session: Session): Promise<void> {
    await this.memoryFallback.saveSession(session);
    try {
      await this.ensureDirs();
      const filePath = path.join(this.baseDir, "sessions", `${session.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
    } catch (error) {
      logger.warn(`Failed to write session '${session.id}' to disk: ${String(error)}`);
    }
  }

  async listSessions(agentId?: string): Promise<Session[]> {
    try {
      await this.ensureDirs();
      const dir = path.join(this.baseDir, "sessions");
      const files = await fs.readdir(dir);
      const sessions: Session[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await fs.readFile(path.join(dir, file), "utf-8");
          const sess = JSON.parse(data) as Session;
          if (!agentId || sess.agentId === agentId) {
            sessions.push(sess);
          }
        } catch {
          // ignore corrupted files
        }
      }
      return sessions;
    } catch {
      return this.memoryFallback.listSessions(agentId);
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.memoryFallback.deleteSession(id);
    try {
      const filePath = path.join(this.baseDir, "sessions", `${id}.json`);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    await this.memoryFallback.saveCheckpoint(checkpoint);
    try {
      await this.ensureDirs();
      const filePath = path.join(this.baseDir, "checkpoints", `${checkpoint.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
    } catch (error) {
      logger.warn(`Failed to persist checkpoint '${checkpoint.id}' to disk: ${String(error)}`);
    }
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    try {
      const filePath = path.join(this.baseDir, "checkpoints", `${id}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as Checkpoint;
    } catch {
      return this.memoryFallback.getCheckpoint(id);
    }
  }

  async getPendingCheckpointByRunId(runId: string): Promise<Checkpoint | null> {
    const list = await this.listPendingCheckpoints();
    return list.find((cp) => cp.runId === runId && cp.status === "pending") || null;
  }

  async listPendingCheckpoints(): Promise<Checkpoint[]> {
    try {
      await this.ensureDirs();
      const dir = path.join(this.baseDir, "checkpoints");
      const files = await fs.readdir(dir);
      const list: Checkpoint[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await fs.readFile(path.join(dir, file), "utf-8");
          const cp = JSON.parse(data) as Checkpoint;
          if (cp.status === "pending") {
            list.push(cp);
          }
        } catch {
          // ignore corrupted file
        }
      }
      return list;
    } catch {
      return this.memoryFallback.listPendingCheckpoints();
    }
  }
}
