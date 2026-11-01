import type { Session } from "./conversation-state.js";
import type { Checkpoint } from "./run-state.js";

export interface StateStore {
  getSession(id: string): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;
  listSessions(agentId?: string): Promise<Session[]>;
  deleteSession(id: string): Promise<boolean>;
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  getCheckpoint(id: string): Promise<Checkpoint | null>;
  getPendingCheckpointByRunId(runId: string): Promise<Checkpoint | null>;
  listPendingCheckpoints(): Promise<Checkpoint[]>;
}
