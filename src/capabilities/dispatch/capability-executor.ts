import { ExecutionContext } from "../../core/execution/execution-context.js";
import { Capability } from "../capability.js";

export interface CapabilityExecutionRequest {
  name: string;
  input: unknown;
}

export interface CapabilityExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export function normalizeCapabilityInput(input: unknown): unknown {
  if (typeof input !== "string") {
    return input;
  }

  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}

export function resolveCapabilityStringField(
  input: unknown,
  ...keys: string[]
): string | undefined {
  const normalized = normalizeCapabilityInput(input);

  if (typeof normalized === "string") {
    return normalized;
  }

  if (typeof normalized !== "object" || normalized === null) {
    return undefined;
  }

  const record = normalized as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

export interface CapabilityExecutor {
  execute(
    request: CapabilityExecutionRequest,
    context: ExecutionContext,
    capability?: Capability,
  ): Promise<CapabilityExecutionResult>;
}
