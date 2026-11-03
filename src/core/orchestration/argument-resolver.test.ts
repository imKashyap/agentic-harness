import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  canonicalizeReferences,
  evaluateCondition,
  extractCondition,
  extractRefs,
  isDeferredRef,
  refTaskId,
  resolveTaskAlias,
  resolveTaskInput,
} from "./argument-resolver.js";

describe("isDeferredRef", () => {
  it("matches valid reference strings", () => {
    assert.strictEqual(isDeferredRef("$call_1.output.value"), true);
    assert.strictEqual(isDeferredRef("$call-1.result"), true);
    assert.strictEqual(isDeferredRef("$t1"), true);
  });

  it("rejects non-reference values", () => {
    assert.strictEqual(isDeferredRef("call_1.output"), false);
    assert.strictEqual(isDeferredRef("plain string"), false);
    assert.strictEqual(isDeferredRef(42), false);
    assert.strictEqual(isDeferredRef(null), false);
    assert.strictEqual(isDeferredRef({ ref: "$t1.x" }), false);
  });
});

describe("extractRefs", () => {
  it("collects refs from nested objects and arrays", () => {
    const input = {
      a: "$t1.output.x",
      list: ["plain", "$t2.result"],
      nested: { deep: { value: "$t3" } },
    };
    assert.deepStrictEqual(extractRefs(input).sort(), ["$t1.output.x", "$t2.result", "$t3"]);
  });

  it("extracts embedded refs inside text strings", () => {
    const input = {
      message: "The temperature in $call_1.city is $call_1.temperature.celsius C",
    };
    assert.deepStrictEqual(extractRefs(input).sort(), [
      "$call_1.city",
      "$call_1.temperature.celsius",
    ]);
  });

  it("returns empty for inputs without refs", () => {
    assert.deepStrictEqual(extractRefs({ a: 1, b: "text", c: { d: [true] } }), []);
    assert.deepStrictEqual(extractRefs(null), []);
  });
});

describe("resolveTaskInput", () => {
  const results = new Map([
    [
      "call_1",
      {
        taskId: "call_1",
        status: "completed" as const,
        output: { temperature: { celsius: 28 }, city: "Bangalore" },
      },
    ],
  ]);

  it("substitutes refs with dependency output values", () => {
    const resolved = resolveTaskInput(
      {
        id: "call_2",
        input: {
          message: "its cold outside",
          threshold: "$call_1.temperature.celsius",
          city: "$call_1.city",
        },
      },
      results,
    );

    assert.deepStrictEqual(resolved, {
      message: "its cold outside",
      threshold: 28,
      city: "Bangalore",
    });
  });

  it("tolerates and unwraps optional .output. prefix in path", () => {
    const resolved = resolveTaskInput(
      {
        id: "call_2",
        input: {
          threshold: "$call_1.output.temperature.celsius",
          city: "$call_1.output.city",
        },
      },
      results,
    );

    assert.deepStrictEqual(resolved, {
      threshold: 28,
      city: "Bangalore",
    });
  });

  it("interpolates embedded references inside strings", () => {
    const resolved = resolveTaskInput(
      {
        id: "call_2",
        input: {
          message: "The temperature in $call_1.city is $call_1.temperature.celsius C",
        },
      },
      results,
    );

    assert.deepStrictEqual(resolved, {
      message: "The temperature in Bangalore is 28 C",
    });
  });

  it("strips the reserved _condition key", () => {
    const resolved = resolveTaskInput(
      {
        id: "call_2",
        input: {
          message: "hi",
          _condition: { left: "$call_1.output.temperature.celsius", op: "<", right: 30 },
        },
      },
      results,
    );

    assert.deepStrictEqual(resolved, { message: "hi" });
  });

  it("throws when the referenced task has no completed result", () => {
    assert.throws(
      () => resolveTaskInput({ id: "call_2", input: { x: "$missing.output" } }, results),
      /is not available/,
    );
  });

  it("throws when a path segment is missing in the output", () => {
    assert.throws(
      () =>
        resolveTaskInput({ id: "call_2", input: { x: "$call_1.temperature.fahrenheit" } }, results),
      /segment 'fahrenheit' not found/,
    );
  });

  it("does not mutate the original input", () => {
    const input = { x: "$call_1.city" };
    resolveTaskInput({ id: "call_2", input }, results);
    assert.strictEqual(input.x, "$call_1.city");
  });

  it("strips only the top-level _condition and preserves nested ones", () => {
    const nestedCondition = { left: 1, op: "==" as const, right: 1 };
    const resolved = resolveTaskInput(
      {
        id: "call_2",
        input: {
          message: "hi",
          _condition: { left: "$call_1.temperature", op: "<" as const, right: 30 },
          nested: { _condition: nestedCondition },
        },
      },
      results,
    );

    assert.deepStrictEqual(resolved, {
      message: "hi",
      nested: { _condition: nestedCondition },
    });
  });

  it("passes inputs without refs through by reference (no deep clone)", () => {
    const input = {
      message: "hi",
      at: new Date(0),
      nested: { _condition: { left: 1, op: "==" as const, right: 1 } },
    };
    const resolved = resolveTaskInput({ id: "call_2", input }, results);
    assert.strictEqual(resolved, input);
  });

  it("strips the top-level _condition even when there are no refs", () => {
    const resolved = resolveTaskInput(
      {
        id: "call_2",
        input: { message: "hi", _condition: { left: 1, op: "==" as const, right: 1 } },
      },
      results,
    );
    assert.deepStrictEqual(resolved, { message: "hi" });
  });

  it("throws when the referenced result has no output", () => {
    const failedResults = new Map([
      ["call_1", { taskId: "call_1", status: "failed" as const, error: "boom" }],
    ]);
    assert.throws(
      () => resolveTaskInput({ id: "call_2", input: { x: "$call_1" } }, failedResults),
      /is missing or empty/,
    );
  });
});

describe("refTaskId", () => {
  it("extracts the referenced task id from a deferred reference", () => {
    assert.strictEqual(refTaskId("$call_1.output.value"), "call_1");
    assert.strictEqual(refTaskId("$t1"), "t1");
    assert.strictEqual(refTaskId("$agent-9.result"), "agent-9");
  });

  it("returns empty for non-references", () => {
    assert.strictEqual(refTaskId("nope"), "");
    assert.strictEqual(refTaskId(""), "");
  });
});

describe("extractCondition / evaluateCondition", () => {
  const results = new Map([
    ["call_1", { taskId: "call_1", status: "completed" as const, output: { temperature: 28 } }],
  ]);

  it("extracts well-formed conditions", () => {
    const condition = { left: "$call_1.output.temperature", op: "<", right: 30 };
    assert.deepStrictEqual(extractCondition({ _condition: condition, message: "x" }), condition);
    assert.strictEqual(extractCondition({ message: "x" }), undefined);
    assert.strictEqual(extractCondition({ _condition: "temp < 30" }), undefined);
  });

  it("evaluates numeric comparisons against resolved refs", () => {
    const resultsMap = results;
    assert.strictEqual(
      evaluateCondition({ left: "$call_1.temperature", op: "<", right: 30 }, resultsMap),
      true,
    );
    assert.strictEqual(
      evaluateCondition({ left: "$call_1.temperature", op: ">=", right: 30 }, resultsMap),
      false,
    );
    assert.strictEqual(
      evaluateCondition({ left: "$call_1.temperature", op: "==", right: "28" }, resultsMap),
      true,
    );
    assert.strictEqual(
      evaluateCondition({ left: "$call_1.temperature", op: "!=", right: 30 }, resultsMap),
      true,
    );
  });

  it("evaluates to false when a ref cannot be resolved", () => {
    assert.strictEqual(
      evaluateCondition({ left: "$missing.output.temp", op: "<", right: 30 }, results),
      false,
    );
    assert.strictEqual(
      evaluateCondition({ left: "$call_1.nope", op: "<", right: 30 }, results),
      false,
    );
  });

  it("evaluates to false for non-numeric ordered comparisons", () => {
    assert.strictEqual(evaluateCondition({ left: "abc", op: "<", right: "abd" }, results), false);
  });
});

describe("resolveTaskAlias", () => {
  const toolCalls = [
    { id: "chatcmpl-tool-1", name: "tool.get_weather" },
    { id: "chatcmpl-tool-2", name: "tool.cowsay" },
  ];

  it("preserves exact tool call IDs", () => {
    assert.strictEqual(resolveTaskAlias("chatcmpl-tool-1", 1, toolCalls), "chatcmpl-tool-1");
  });

  it("resolves call_0 (0-indexed) to toolCalls[0]", () => {
    assert.strictEqual(resolveTaskAlias("call_0", 1, toolCalls), "chatcmpl-tool-1");
    assert.strictEqual(resolveTaskAlias("call-0", 1, toolCalls), "chatcmpl-tool-1");
    assert.strictEqual(resolveTaskAlias("step_0", 1, toolCalls), "chatcmpl-tool-1");
  });

  it("resolves call_1 (1-indexed when at call 1) to toolCalls[0]", () => {
    assert.strictEqual(resolveTaskAlias("call_1", 1, toolCalls), "chatcmpl-tool-1");
    assert.strictEqual(resolveTaskAlias("step_1", 1, toolCalls), "chatcmpl-tool-1");
  });

  it("resolves tool name alias to upstream tool call id", () => {
    assert.strictEqual(resolveTaskAlias("tool.get_weather", 1, toolCalls), "chatcmpl-tool-1");
    assert.strictEqual(resolveTaskAlias("get_weather", 1, toolCalls), "chatcmpl-tool-1");
  });

  it("returns original alias when unknown", () => {
    assert.strictEqual(resolveTaskAlias("unknown_call", 1, toolCalls), "unknown_call");
  });
});

describe("canonicalizeReferences", () => {
  const toolCalls = [
    { id: "chatcmpl-tool-1", name: "tool.get_weather" },
    { id: "chatcmpl-tool-8ec40bbf0906a039", name: "tool.cowsay" },
  ];

  it("canonicalizes $call_0 into the upstream toolCall ID", () => {
    const input = { message: "$call_0.temperature.currentCelsius" };
    const canonical = canonicalizeReferences(input, 1, toolCalls);
    assert.deepStrictEqual(canonical, {
      message: "$chatcmpl-tool-1.temperature.currentCelsius",
    });
  });

  it("canonicalizes tool name references into the upstream toolCall ID", () => {
    const input = { message: "$get_weather.temperature.currentCelsius" };
    const canonical = canonicalizeReferences(input, 1, toolCalls);
    assert.deepStrictEqual(canonical, {
      message: "$chatcmpl-tool-1.temperature.currentCelsius",
    });
  });

  it("canonicalizes embedded references in strings", () => {
    const input = { message: "Temp is $call_0.temperature.currentCelsius C" };
    const canonical = canonicalizeReferences(input, 1, toolCalls);
    assert.deepStrictEqual(canonical, {
      message: "Temp is $chatcmpl-tool-1.temperature.currentCelsius C",
    });
  });
});
