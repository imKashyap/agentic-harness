import { promises as fs } from "node:fs";
import * as path from "node:path";

import { createLogger } from "../utils/logger.js";
import { ApprovalStatus, Checkpoint, CheckpointStore } from "./types.js";

const logger = createLogger("CheckpointStore");

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<string, Checkpoint>();

  async save(checkpoint: Checkpoint): Promise<void> {
    logger.debug(
      `Saving checkpoint [${checkpoint.id}] (run: ${checkpoint.runId}, task: ${checkpoint.taskId})`,
    );
    this.checkpoints.set(checkpoint.id, { ...checkpoint });
  }

  async get(id: string): Promise<Checkpoint | null> {
    const cp = this.checkpoints.get(id);
    return cp ? { ...cp } : null;
  }

  async getByRunId(runId: string): Promise<Checkpoint | null> {
    for (const cp of this.checkpoints.values()) {
      if (cp.runId === runId && cp.status === "pending") {
        return { ...cp };
      }
    }
    for (const cp of this.checkpoints.values()) {
      if (cp.runId === runId) {
        return { ...cp };
      }
    }
    return null;
  }

  async updateStatus(id: string, status: ApprovalStatus, reason?: string): Promise<boolean> {
    const cp = this.checkpoints.get(id);
    if (!cp) {
      return false;
    }
    cp.status = status;
    cp.reason = reason;
    cp.resolvedAt = Date.now();
    logger.info(
      `Updated checkpoint [${id}] status to '${status}'${reason ? ` (reason: ${reason})` : ""}`,
    );
    return true;
  }

  async list(status?: ApprovalStatus): Promise<Checkpoint[]> {
    const all = Array.from(this.checkpoints.values());
    if (!status) {
      return all;
    }
    return all.filter((cp) => cp.status === status);
  }

  async delete(id: string): Promise<boolean> {
    return this.checkpoints.delete(id);
  }

  async clear(): Promise<void> {
    this.checkpoints.clear();
  }
}

export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly dir: string = "./checkpoints") {}

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch {
      // exists
    }
  }

  private getFilePath(id: string): string {
    const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dir, `${sanitized}.json`);
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(checkpoint.id);
    await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
  }

  async get(id: string): Promise<Checkpoint | null> {
    await this.ensureDir();
    const filePath = this.getFilePath(id);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as Checkpoint;
    } catch {
      return null;
    }
  }

  async getByRunId(runId: string): Promise<Checkpoint | null> {
    const all = await this.list();
    return (
      all.find((cp) => cp.runId === runId && cp.status === "pending") ??
      all.find((cp) => cp.runId === runId) ??
      null
    );
  }

  async updateStatus(id: string, status: ApprovalStatus, reason?: string): Promise<boolean> {
    const cp = await this.get(id);
    if (!cp) {
      return false;
    }
    cp.status = status;
    cp.reason = reason;
    cp.resolvedAt = Date.now();
    await this.save(cp);
    return true;
  }

  async list(status?: ApprovalStatus): Promise<Checkpoint[]> {
    await this.ensureDir();
    try {
      const files = await fs.readdir(this.dir);
      const list: Checkpoint[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) {
          continue;
        }
        try {
          const content = await fs.readFile(path.join(this.dir, file), "utf-8");
          const cp = JSON.parse(content) as Checkpoint;
          if (!status || cp.status === status) {
            list.push(cp);
          }
        } catch {
          // ignore corrupted file
        }
      }
      return list.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureDir();
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
