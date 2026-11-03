import { PlanValidationError } from "../../errors/orchestration-errors.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionResult } from "../execution/execution-result.js";

const logger = createLogger("ArgumentResolver");

/**
 * Matches deferred output references emitted by the model, e.g. "$call_1.output.temperature".
 * Group 1 = referenced tool call ID, Group 2 = dotted JSON path into its result output.
 */
export const DEFERRED_REF_PATTERN = /^\$([A-Za-z0-9_-]+)((?:\.[A-Za-z0-9_-]+)*)$/;

/** Reserved argument key carrying a skip/execute condition evaluated at execution time. */
export const CONDITION_KEY = "_condition";

/** Reason recorded on tasks skipped by the deferred-condition gate. */
export const CONDITION_SKIPPED_REASON = "Deferred condition evaluated to false";

export type ConditionOperator = "<" | "<=" | ">" | ">=" | "==" | "!=";

export interface TaskCondition {
  left: unknown;
  op: ConditionOperator;
  right: unknown;
}

const VALID_OPERATORS = new Set<ConditionOperator>(["<", "<=", ">", ">=", "==", "!="]);

/** Shape of the output recorded for a task skipped by its deferred condition. */
export interface SkippedOutput {
  skipped: true;
  reason: string;
}

/** Builds the output object recorded for a skipped task. */
export function skippedOutput(reason: string): SkippedOutput {
  return { skipped: true, reason };
}

/** Returns true when the result represents a task skipped by its deferred condition. */
export function isSkippedResult(result: ExecutionResult): boolean {
  return (
    result.status === "completed" &&
    typeof result.output === "object" &&
    result.output !== null &&
    (result.output as Record<string, unknown>).skipped === true
  );
}

/** Returns true if the value is a deferred reference string (e.g. "$call_1.output.temperature"). */
export function isDeferredRef(value: unknown): value is string {
  return typeof value === "string" && DEFERRED_REF_PATTERN.test(value);
}

/** Deep-walks a task input and collects every deferred reference string it contains. */
export function extractRefs(input: unknown): string[] {
  const refs = new Set<string>();

  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (isDeferredRef(value)) {
        refs.add(value);
      } else {
        const matches = (value as string).match(/\$([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/g);
        if (matches) {
          for (const m of matches) {
            if (DEFERRED_REF_PATTERN.test(m)) {
              refs.add(m);
            }
          }
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const item of Object.values(value)) {
        walk(item);
      }
    }
  };

  walk(input);
  return [...refs];
}

/** Returns the `_condition` of a task input if present and well-formed, otherwise undefined. */
export function extractCondition(input: unknown): TaskCondition | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const condition = (input as Record<string, unknown>)[CONDITION_KEY];
  return isTaskCondition(condition) ? condition : undefined;
}

/** Validates the shape of a deferred condition object. */
export function isTaskCondition(value: unknown): value is TaskCondition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const condition = value as Record<string, unknown>;
  return (
    "left" in condition &&
    "right" in condition &&
    typeof condition.op === "string" &&
    VALID_OPERATORS.has(condition.op as ConditionOperator)
  );
}

interface RefLookup {
  taskId: string;
  path: string[];
}

/** Extracts the referenced task ID from a deferred reference (e.g. "call_1" from "$call_1.temperature"). */
export function refTaskId(ref: string): string {
  return DEFERRED_REF_PATTERN.exec(ref)?.[1] ?? "";
}

export interface TaskCallSummary {
  id: string;
  name?: string;
  capability?: string;
}

/**
 * Resolves a referenced task alias (such as "call_0", "call_1", "step_0", "get_weather")
 * to the actual task ID of an upstream tool call.
 */
export function resolveTaskAlias(
  referencedId: string,
  currentCallIndex: number,
  toolCalls: TaskCallSummary[],
): string {
  if (toolCalls.length === 0) {
    return referencedId;
  }

  // 1. Exact match with any tool call ID in the plan
  if (toolCalls.some((tc) => tc.id === referencedId)) {
    return referencedId;
  }

  // 2. Positional / Index alias: call_0, call-0, step_0, step-0, task_0, task-0, call0, etc.
  const indexMatch = /^(?:call|step|task)[_-]?(\d+)$/i.exec(referencedId);
  if (indexMatch) {
    const num = parseInt(indexMatch[1]!, 10);

    // 0 is unambiguously 0-based index 0
    if (num === 0) {
      return toolCalls[0]!.id;
    }

    // In 1-based indexing, if num === currentCallIndex, it cannot reference itself,
    // so it must refer to toolCalls[num - 1] (e.g. call_1 inside toolCalls[1] refers to toolCalls[0]).
    if (num === currentCallIndex && num - 1 >= 0 && num - 1 < toolCalls.length) {
      return toolCalls[num - 1]!.id;
    }

    // If num < currentCallIndex, it refers to toolCalls[num] (0-based)
    if (num < currentCallIndex && num < toolCalls.length) {
      return toolCalls[num]!.id;
    }

    // If num - 1 < currentCallIndex, it could be 1-based (num - 1)
    if (num - 1 >= 0 && num - 1 < currentCallIndex && num - 1 < toolCalls.length) {
      return toolCalls[num - 1]!.id;
    }

    // Two-call batch fallback: if there are 2 calls and this is call 1, any call_0 or call_1 must be call 0
    if (toolCalls.length === 2 && currentCallIndex === 1 && (num === 0 || num === 1)) {
      return toolCalls[0]!.id;
    }
  }

  // Pure numeric alias: e.g. "0" or "1"
  if (/^\d+$/.test(referencedId)) {
    const num = parseInt(referencedId, 10);
    if (num === 0) {
      return toolCalls[0]!.id;
    }
    if (num === currentCallIndex && num - 1 >= 0 && num - 1 < toolCalls.length) {
      return toolCalls[num - 1]!.id;
    }
    if (num < currentCallIndex && num < toolCalls.length) {
      return toolCalls[num]!.id;
    }
  }

  // 3. Tool / capability name alias: e.g. "tool.get_weather" or "get_weather"
  const cleanRef = referencedId.replace(/^(?:tool|agent)\./, "");
  for (let i = 0; i < currentCallIndex && i < toolCalls.length; i++) {
    const tc = toolCalls[i]!;
    const tcName = tc.name ?? tc.capability ?? "";
    const cleanTcName = tcName.replace(/^(?:tool|agent)\./, "");
    if (tcName === referencedId || cleanTcName === cleanRef) {
      return tc.id;
    }
  }

  return referencedId;
}

/**
 * Rewrites any deferred reference aliases (such as "$call_0.temp", "$call_1.temp", "$get_weather.temp")
 * in task arguments to use the canonical upstream tool call ID.
 */
export function canonicalizeReferences(
  input: unknown,
  currentCallIndex: number,
  toolCalls: TaskCallSummary[],
): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  const transformString = (str: string): string => {
    // 1. Direct tool-name prefix with dot: e.g. "$tool.get_weather.temperature" or "$get_weather.temperature"
    for (let i = 0; i < currentCallIndex && i < toolCalls.length; i++) {
      const tc = toolCalls[i]!;
      const tcName = tc.name ?? tc.capability ?? "";
      if (tcName) {
        const fullPrefix = `$${tcName}.`;
        if (str.includes(fullPrefix)) {
          str = str.replaceAll(fullPrefix, `$${tc.id}.`);
        }
        const shortName = tcName.replace(/^(?:tool|agent)\./, "");
        const shortPrefix = `$${shortName}.`;
        if (str.includes(shortPrefix)) {
          str = str.replaceAll(shortPrefix, `$${tc.id}.`);
        }
      }
    }

    // 2. Standard and embedded references: $alias.path or $alias
    return str.replace(/\$([A-Za-z0-9_-]+)((?:\.[A-Za-z0-9_-]+)*)/g, (match, alias, path) => {
      const canonicalId = resolveTaskAlias(alias, currentCallIndex, toolCalls);
      return `$${canonicalId}${path}`;
    });
  };

  const walk = (val: unknown): unknown => {
    if (typeof val === "string") {
      return transformString(val);
    }
    if (Array.isArray(val)) {
      return val.map((item) => walk(item));
    }
    if (val !== null && typeof val === "object") {
      const res: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        res[k] = walk(v);
      }
      return res;
    }
    return val;
  };

  return walk(input);
}

function parseRef(ref: string): RefLookup {
  const match = DEFERRED_REF_PATTERN.exec(ref);
  if (!match) {
    throw new PlanValidationError(`Malformed deferred reference: '${ref}'`);
  }
  const taskId = match[1] ?? "";
  const path = match[2] ?? "";
  return {
    taskId,
    path: path.length > 0 ? path.slice(1).split(".") : [],
  };
}

function getRefValue(ref: string, resultsByTaskId: Map<string, ExecutionResult>): unknown {
  const { taskId, path } = parseRef(ref);
  const result = resultsByTaskId.get(taskId);

  if (!result) {
    throw new PlanValidationError(
      `Task output '${taskId}' referenced by '${ref}' is not available (missing or not yet completed)`,
      { taskId, ref },
    );
  }

  if (result.output === null || result.output === undefined) {
    throw new PlanValidationError(
      `Task output '${taskId}' referenced by '${ref}' is missing or empty`,
      { taskId, ref },
    );
  }

  let value: unknown = result.output;
  const segments = [...path];

  // If the path starts with "output" but the output object does not have an "output" property,
  // tolerate and unwrap the "output." prefix (common when models follow $<id>.<json.path.into.output>).
  if (
    segments[0] === "output" &&
    typeof value === "object" &&
    value !== null &&
    !("output" in value)
  ) {
    segments.shift();
  }

  for (const segment of segments) {
    if (value === null || typeof value !== "object") {
      throw new PlanValidationError(
        `Cannot resolve path '${ref}': segment '${segment}' not found in output of task '${taskId}'`,
        { taskId, ref, segment },
      );
    }
    const next = (value as Record<string, unknown>)[segment];
    if (next === undefined) {
      throw new PlanValidationError(
        `Cannot resolve path '${ref}': segment '${segment}' not found in output of task '${taskId}'`,
        { taskId, ref, segment },
      );
    }
    value = next;
  }
  return value;
}
/**
 * Produces the task input with every deferred reference replaced by the corresponding
 * dependency output value, and the reserved top-level `_condition` key stripped
 * (nested `_condition` keys are ordinary values and are left untouched).
 * Throws PlanValidationError when a referenced task has no completed result or a path
 * segment is missing. Inputs without any references are passed through without
 * deep-cloning so non-plain values (Date, Map, class instances) survive untouched.
 */
export function resolveTaskInput(
  task: { id: string; input: unknown },
  resultsByTaskId: Map<string, ExecutionResult>,
): unknown {
  if (extractRefs(task.input).length === 0) {
    if (
      task.input !== null &&
      typeof task.input === "object" &&
      !Array.isArray(task.input) &&
      CONDITION_KEY in (task.input as object)
    ) {
      const rest: Record<string, unknown> = { ...(task.input as Record<string, unknown>) };
      delete rest[CONDITION_KEY];
      logger.debug(`Task [${task.id}] top-level _condition stripped (no deferred references)`);
      return rest;
    }
    logger.debug(`Task [${task.id}] has no deferred references; input passed through`);
    return task.input;
  }

  const resolve = (value: unknown): unknown => {
    if (isDeferredRef(value)) {
      return getRefValue(value, resultsByTaskId);
    }
    if (typeof value === "string") {
      const hasEmbedded = /\$([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/.test(value);
      if (hasEmbedded) {
        return value.replace(/\$([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/g, (match) => {
          const taskId = refTaskId(match);
          if (resultsByTaskId.has(taskId)) {
            try {
              const resolved = getRefValue(match, resultsByTaskId);
              return typeof resolved === "object" && resolved !== null
                ? JSON.stringify(resolved)
                : String(resolved);
            } catch {
              return match;
            }
          }
          return match;
        });
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolve(item));
    }
    if (value !== null && typeof value === "object") {
      const resolved: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        resolved[key] = resolve(item);
      }
      return resolved;
    }
    return value;
  };

  let resolvedInput: unknown;
  if (Array.isArray(task.input)) {
    resolvedInput = task.input.map((item) => resolve(item));
  } else if (task.input !== null && typeof task.input === "object") {
    // Top-level object: strip the reserved _condition key, resolve everything else.
    // Nested _condition keys are ordinary values and are left untouched.
    resolvedInput = {} as Record<string, unknown>;
    for (const [key, item] of Object.entries(task.input)) {
      if (key === CONDITION_KEY) {
        continue; // reserved top-level key, stripped before capability invocation
      }
      (resolvedInput as Record<string, unknown>)[key] = resolve(item);
    }
  } else {
    resolvedInput = resolve(task.input);
  }

  logger.debug(`Task [${task.id}] deferred arguments resolved`);
  return resolvedInput;
}

/** Resolves one side of a condition; unresolvable refs yield undefined (treated as false). */
function resolveConditionOperand(
  operand: unknown,
  resultsByTaskId: Map<string, ExecutionResult>,
): unknown {
  if (!isDeferredRef(operand)) {
    return operand;
  }
  try {
    return getRefValue(operand, resultsByTaskId);
  } catch (error) {
    logger.debug(`Condition operand '${operand}' could not be resolved: ${String(error)}`);
    return undefined;
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

/**
 * Evaluates a deferred condition against completed dependency results.
 * Ordered comparisons require both operands to be numeric. Equality falls back to
 * strict equality when operands are not numeric. Conditions whose operands cannot
 * be resolved evaluate to false (safe skip).
 */
export function evaluateCondition(
  condition: TaskCondition,
  resultsByTaskId: Map<string, ExecutionResult>,
): boolean {
  const left = resolveConditionOperand(condition.left, resultsByTaskId);
  const right = resolveConditionOperand(condition.right, resultsByTaskId);

  if (left === undefined || right === undefined) {
    return false;
  }

  const numLeft = toNumber(left);
  const numRight = toNumber(right);
  const bothNumeric = numLeft !== undefined && numRight !== undefined;

  switch (condition.op) {
    case "==":
      return bothNumeric ? numLeft === numRight : left === right;
    case "!=":
      return bothNumeric ? numLeft !== numRight : left !== right;
    case "<":
      return bothNumeric ? (numLeft as number) < (numRight as number) : false;
    case "<=":
      return bothNumeric ? (numLeft as number) <= (numRight as number) : false;
    case ">":
      return bothNumeric ? (numLeft as number) > (numRight as number) : false;
    case ">=":
      return bothNumeric ? (numLeft as number) >= (numRight as number) : false;
    default:
      return false;
  }
}
