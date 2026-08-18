import { TaskStatus } from "./task-status.js";

export type TaskType = "capability";

export interface Task {
  id: string;

  type: TaskType;

  capability: string;

  input: unknown;

  status: TaskStatus;

  dependsOn?: string[];
}
