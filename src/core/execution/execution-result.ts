export interface ExecutionResult {
  taskId: string;

  status: "completed" | "failed";

  output?: unknown;

  error?: string;
}
