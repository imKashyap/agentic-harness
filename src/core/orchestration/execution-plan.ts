import { Task } from "../execution/task.js";

export interface ExecutionPlan {
  id: string;

  tasks: Task[];

  createdAt: number;
}
