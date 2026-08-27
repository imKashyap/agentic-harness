import { injectable } from "inversify";

import { createLogger } from "../../utils/logger.js";
import { Session } from "../types.js";
import { SessionStore } from "./session-store.js";

const logger = createLogger("InMemorySessionStore");

@injectable()
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  async get(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    // Return deep clone of messages to avoid inadvertent external mutations
    return {
      ...session,
      messages: session.messages.map((m) => ({ ...m })),
    };
  }

  async save(session: Session): Promise<void> {
    logger.debug(
      `Saving session [${session.id}] (agent: ${session.agentId}, messages: ${session.messages.length})`,
    );
    this.sessions.set(session.id, {
      ...session,
      updatedAt: Date.now(),
      messages: session.messages.map((m) => ({ ...m })),
    });
  }

  async delete(sessionId: string): Promise<boolean> {
    logger.debug(`Deleting session [${sessionId}]`);
    return this.sessions.delete(sessionId);
  }

  async list(agentId?: string): Promise<Session[]> {
    const all = Array.from(this.sessions.values());
    if (!agentId) {
      return all;
    }
    return all.filter((s) => s.agentId === agentId);
  }

  async clear(): Promise<void> {
    this.sessions.clear();
  }
}
