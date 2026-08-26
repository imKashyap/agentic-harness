import { Session } from "../types.js";

export interface SessionStore {
  get(sessionId: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
  list(agentId?: string): Promise<Session[]>;
  clear?(): Promise<void>;
}
