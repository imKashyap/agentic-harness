import { promises as fs } from "node:fs";
import * as path from "node:path";

import { injectable, unmanaged } from "inversify";

import { createLogger } from "../../utils/logger.js";
import { Session } from "../types.js";
import type { SessionStore } from "./session-store.js";

const logger = createLogger("FileSessionStore");

@injectable()
export class FileSessionStore implements SessionStore {
  constructor(@unmanaged() private readonly sessionsDir: string = "./sessions") {}

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch {
      // directory exists
    }
  }

  private getSessionPath(sessionId: string): string {
    const sanitizedId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.sessionsDir, `${sanitizedId}.json`);
  }

  async get(sessionId: string): Promise<Session | null> {
    await this.ensureDir();
    const filePath = this.getSessionPath(sessionId);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as Session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      logger.error(`Error reading session file ${filePath}: ${String(error)}`);
      return null;
    }
  }

  async save(session: Session): Promise<void> {
    await this.ensureDir();
    const filePath = this.getSessionPath(session.id);
    const updatedSession: Session = {
      ...session,
      updatedAt: Date.now(),
    };

    logger.debug(
      `Persisting session [${session.id}] to ${filePath} (${session.messages.length} messages)`,
    );
    await fs.writeFile(filePath, JSON.stringify(updatedSession, null, 2), "utf-8");
  }

  async delete(sessionId: string): Promise<boolean> {
    await this.ensureDir();
    const filePath = this.getSessionPath(sessionId);
    try {
      await fs.unlink(filePath);
      logger.debug(`Deleted session file: ${filePath}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      logger.error(`Failed to delete session file ${filePath}: ${String(error)}`);
      return false;
    }
  }

  async list(agentId?: string): Promise<Session[]> {
    await this.ensureDir();
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessions: Session[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) {
          continue;
        }
        try {
          const content = await fs.readFile(path.join(this.sessionsDir, file), "utf-8");
          const session = JSON.parse(content) as Session;
          if (!agentId || session.agentId === agentId) {
            sessions.push(session);
          }
        } catch {
          // ignore corrupted or unreadable session files
        }
      }

      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      logger.error(`Failed to list sessions directory: ${String(error)}`);
      return [];
    }
  }
}
