import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { TestTool } from "../../../tests/support/test-tool.js";
import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { DEFERRED_CALL_GUIDANCE } from "./deferred-call-guidance.js";
import { PlanValidator } from "./plan-validator.js";
import { Planner } from "./planner.js";
import { StaticPlanGenerator } from "./static-plan-generator.js";

describe("StaticPlanGenerator", () => {
  it("generates independent plan steps for all tool calls", async () => {
    const generator = new StaticPlanGenerator();
    const steps = await generator.generate({
      toolCalls: [
        { id: "call-1", name: "tool.test", arguments: { expression: "1 + 1" } },
        { id: "call-2", name: "tool.test", arguments: { expression: "2 + 2" } },
      ],
    });

    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps[0]?.id, "call-1");
    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    assert.strictEqual(steps[1]?.id, "call-2");
    assert.deepStrictEqual(steps[1]?.dependsOn, []);
  });
});

describe("StaticPlanGenerator (Deferred References)", () => {
  const generator = new StaticPlanGenerator();

  it("derives dependencies from deferred references in arguments", async () => {
    const steps = await generator.generate({
      toolCalls: [
        { id: "call-1", name: "tool.test", arguments: { expression: "1 + 1" } },
        {
          id: "call-2",
          name: "tool.test",
          arguments: { expression: "$call-1.result.value" },
        },
      ],
    });

    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    assert.deepStrictEqual(steps[1]?.dependsOn, ["call-1"]);
  });

  it("derives dependencies and canonicalizes refs when model uses call_0 with provider tool IDs", async () => {
    const steps = await generator.generate({
      toolCalls: [
        {
          id: "chatcmpl-tool-upstream123",
          name: "tool.get_weather",
          arguments: { location: "Bangalore" },
        },
        {
          id: "chatcmpl-tool-8ec40bbf0906a039",
          name: "tool.cowsay",
          arguments: { message: "$call_0.temperature.currentCelsius" },
        },
      ],
    });

    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    assert.deepStrictEqual(steps[1]?.dependsOn, ["chatcmpl-tool-upstream123"]);
    assert.deepStrictEqual(steps[1]?.toolCall.arguments, {
      message: "$chatcmpl-tool-upstream123.temperature.currentCelsius",
    });
  });

  it("derives dependencies from refs inside _condition objects", async () => {
    const steps = await generator.generate({
      toolCalls: [
        { id: "call-1", name: "tool.test", arguments: { expression: "1 + 1" } },
        {
          id: "call-2",
          name: "tool.test",
          arguments: {
            message: "cold outside",
            _condition: { left: "$call-1.result.value", op: "<", right: 30 },
          },
        },
      ],
    });

    assert.deepStrictEqual(steps[1]?.dependsOn, ["call-1"]);
  });

  it("ignores self-references and refs to unknown call ids", async () => {
    const steps = await generator.generate({
      toolCalls: [
        { id: "call-1", name: "tool.test", arguments: { expression: "$call-1.result.value" } },
        { id: "call-2", name: "tool.test", arguments: { expression: "$unknown-task.result" } },
      ],
    });

    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    assert.deepStrictEqual(steps[1]?.dependsOn, []);
  });

  it("deduplicates multiple refs to the same dependency", async () => {
    const steps = await generator.generate({
      toolCalls: [
        { id: "call-1", name: "tool.test", arguments: { expression: "1 + 1" } },
        {
          id: "call-2",
          name: "tool.test",
          arguments: { a: "$call-1.result.value", b: "$call-1.result.other" },
        },
      ],
    });

    assert.deepStrictEqual(steps[1]?.dependsOn, ["call-1"]);
  });

  it("handles refs nested in arrays and deep objects", async () => {
    const steps = await generator.generate({
      toolCalls: [
        { id: "call-1", name: "tool.test", arguments: {} },
        {
          id: "call-2",
          name: "tool.test",
          arguments: { items: [{ nested: { deep: ["$call-1.result"] } }] },
        },
      ],
    });

    assert.deepStrictEqual(steps[1]?.dependsOn, ["call-1"]);
  });
});

describe("PlanValidator (Capability-Aware)", () => {
  const registry = new CapabilityRegistry();
  registry.register(new TestTool());
  const validator = new PlanValidator(registry);

  it("validates valid plans with registered capabilities", () => {
    assert.doesNotThrow(() => {
      validator.validate({
        id: "plan-1",
        createdAt: Date.now(),
        tasks: [
          {
            id: "t1",
            type: "capability",
            capability: "tool.test",
            input: {},
            status: "pending",
          },
          {
            id: "t2",
            type: "capability",
            capability: "tool.test",
            input: {},
            status: "pending",
            dependsOn: ["t1"],
          },
        ],
      });
    });
  });

  it("rejects plans containing unregistered capabilities", () => {
    assert.throws(() => {
      validator.validate({
        id: "plan-2",
        createdAt: Date.now(),
        tasks: [
          {
            id: "t1",
            type: "capability",
            capability: "tool.unregistered_tool",
            input: {},
            status: "pending",
          },
        ],
      });
    }, /Capability not found: tool\.unregistered_tool/);
  });

  it("rejects plans with missing dependencies or cycles", () => {
    assert.throws(() => {
      validator.validate({
        id: "plan-3",
        createdAt: Date.now(),
        tasks: [
          {
            id: "t1",
            type: "capability",
            capability: "tool.test",
            input: {},
            status: "pending",
            dependsOn: ["missing-task"],
          },
        ],
      });
    }, /depends on non-existent task 'missing-task'/);

    assert.throws(() => {
      validator.validate({
        id: "plan-4",
        createdAt: Date.now(),
        tasks: [
          {
            id: "a",
            type: "capability",
            capability: "tool.test",
            input: {},
            status: "pending",
            dependsOn: ["b"],
          },
          {
            id: "b",
            type: "capability",
            capability: "tool.test",
            input: {},
            status: "pending",
            dependsOn: ["a"],
          },
        ],
      });
    }, /Dependency cycle detected/);
  });
});

describe("PlanValidator (Deferred References)", () => {
  const registry = new CapabilityRegistry();
  registry.register(new TestTool());
  const validator = new PlanValidator(registry);

  const baseTask = {
    id: "t1",
    type: "capability" as const,
    capability: "tool.test",
    input: {},
    status: "pending" as const,
  };

  it("accepts plans where refs match declared dependsOn", () => {
    assert.doesNotThrow(() => {
      validator.validate({
        id: "plan-refs-ok",
        createdAt: Date.now(),
        tasks: [
          baseTask,
          { ...baseTask, id: "t2", input: { value: "$t1.value" }, dependsOn: ["t1"] },
        ],
      });
    });
  });

  it("rejects refs to unknown task ids", () => {
    assert.throws(() => {
      validator.validate({
        id: "plan-refs-unknown",
        createdAt: Date.now(),
        tasks: [{ ...baseTask, id: "t2", input: { value: "$nope.value" }, dependsOn: [] }],
      });
    }, /references unknown task 'nope'/);
  });

  it("rejects refs whose target is missing from dependsOn", () => {
    assert.throws(() => {
      validator.validate({
        id: "plan-refs-missing-dep",
        createdAt: Date.now(),
        tasks: [baseTask, { ...baseTask, id: "t2", input: { value: "$t1.value" }, dependsOn: [] }],
      });
    }, /does not declare it in dependsOn/);
  });

  it("rejects malformed _condition objects", () => {
    assert.throws(() => {
      validator.validate({
        id: "plan-bad-condition",
        createdAt: Date.now(),
        tasks: [
          baseTask,
          {
            ...baseTask,
            id: "t2",
            dependsOn: ["t1"],
            input: { _condition: { left: "$t1.value", op: "=>", right: 3 } },
          },
        ],
      });
    }, /malformed '_condition'/);
  });
});

describe("Planner", () => {
  it("creates an execution plan", async () => {
    const planGenerator = new StaticPlanGenerator();
    const planner = new Planner(planGenerator);

    const plan = await planner.createPlan({
      toolCalls: [{ id: "test-1", name: "tool.test", arguments: { expression: "5 + 5" } }],
    });

    assert.strictEqual(plan.tasks.length, 1);
    assert.strictEqual(plan.tasks[0]?.capability, "tool.test");
    assert.strictEqual(plan.tasks[0]?.status, "pending");
  });

  it("builds a DAG from deferred refs in a single batched response", async () => {
    const planner = new Planner(new StaticPlanGenerator());

    const plan = await planner.createPlan({
      toolCalls: [
        { id: "call_1", name: "tool.test", arguments: { expression: "weather" } },
        {
          id: "call_2",
          name: "tool.test",
          arguments: {
            message: "its cold outside",
            _condition: { left: "$call_1.temperature", op: "<", right: 30 },
          },
        },
        {
          id: "call_3",
          name: "tool.test",
          arguments: {
            message: "its hot outside",
            _condition: { left: "$call_1.temperature", op: ">=", right: 30 },
          },
        },
      ],
    });

    assert.strictEqual(plan.tasks.length, 3);
    assert.deepStrictEqual(plan.tasks[0]?.dependsOn, []);
    assert.deepStrictEqual(plan.tasks[1]?.dependsOn, ["call_1"]);
    assert.deepStrictEqual(plan.tasks[2]?.dependsOn, ["call_1"]);
  });
});

describe("DEFERRED_CALL_GUIDANCE (Batching Contract)", () => {
  it("states the groundable-prefix batching rule (literals or deferred references only)", () => {
    assert.match(
      DEFERRED_CALL_GUIDANCE,
      /ONLY when every argument of every call is a literal value or a deferred reference/,
    );
  });

  it("states that judgment-dependent calls are deferred to a later turn", () => {
    assert.match(DEFERRED_CALL_GUIDANCE, /do NOT emit that call yet/);
    assert.match(DEFERRED_CALL_GUIDANCE, /in a later turn once those results are available/);
  });

  it("does not force-batch calls with ungroundable arguments (no 'MUST NOT be emitted in a later turn')", () => {
    assert.doesNotMatch(DEFERRED_CALL_GUIDANCE, /MUST NOT be emitted in a later turn/);
  });

  it("documents the deferred reference syntax and the _condition operators", () => {
    assert.match(DEFERRED_CALL_GUIDANCE, /\$<toolCallId>\.<json\.path\.into\.output>/);
    assert.match(DEFERRED_CALL_GUIDANCE, /Supported operators: "<", "<=", ">", ">=", "==", "!="\./);
  });
});
