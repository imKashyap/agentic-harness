import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { TestTool } from "../../../tests/support/test-tool.js";
import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { ToolCapabilityExecutor } from "../../capabilities/tools/tool-capability-executor.js";
import { ToolExecutor } from "../../capabilities/tools/tool-executor.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { Task } from "../execution/task.js";
import { DependencyGraph } from "./dependency-graph.js";
import { ExecutionEngine } from "./execution-engine.js";
import { Orchestrator } from "./orchestrator.js";
import { PlanValidator } from "./plan-validator.js";
import { Planner } from "./planner.js";
import { Scheduler } from "./scheduler.js";
import { StaticPlanGenerator } from "./static-plan-generator.js";

describe("ExecutionEngine (Deferred References & Conditions)", () => {
  it("resolves deferred refs from completed dependencies before execution", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new TestTool());

    const engine = new ExecutionEngine(
      new ToolCapabilityExecutor(registry, new ToolExecutor()),
      new Scheduler(),
    );

    const tasks: Task[] = [
      {
        id: "call_1",
        type: "capability",
        capability: "tool.test",
        input: { temperature: 28 },
        status: "pending",
      },
      {
        id: "call_2",
        type: "capability",
        capability: "tool.test",
        input: { message: "its cold outside", temp: "$call_1.temperature" },
        status: "pending",
        dependsOn: ["call_1"],
      },
    ];

    const results = await engine.execute(tasks, {
      runId: "run-refs",
      agentId: "supervisor",
      allowedCapabilities: ["tool.test"],
    });

    assert.strictEqual(results.length, 2);
    // TestTool echoes its input back; temp must be resolved from call_1's output
    assert.deepStrictEqual(results[1]?.output, {
      message: "its cold outside",
      temp: 28,
    });
  });

  it("skips tasks whose _condition evaluates to false but keeps them completed", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new TestTool());

    const engine = new ExecutionEngine(
      new ToolCapabilityExecutor(registry, new ToolExecutor()),
      new Scheduler(),
    );

    const tasks: Task[] = [
      {
        id: "call_1",
        type: "capability",
        capability: "tool.test",
        input: { temperature: 28 },
        status: "pending",
      },
      {
        id: "call_2",
        type: "capability",
        capability: "tool.test",
        input: {
          message: "its cold outside",
          _condition: { left: "$call_1.temperature", op: "<", right: 30 },
        },
        status: "pending",
        dependsOn: ["call_1"],
      },
      {
        id: "call_3",
        type: "capability",
        capability: "tool.test",
        input: {
          message: "its hot outside",
          _condition: { left: "$call_1.temperature", op: ">=", right: 30 },
        },
        status: "pending",
        dependsOn: ["call_1"],
      },
    ];

    const results = await engine.execute(tasks, {
      runId: "run-cond",
      agentId: "supervisor",
      allowedCapabilities: ["tool.test"],
    });

    assert.strictEqual(results.length, 3);

    const cold = results.find((r) => r.taskId === "call_2");
    const hot = results.find((r) => r.taskId === "call_3");

    // 28 < 30 -> cold branch executes; hot branch skipped
    assert.strictEqual(cold?.status, "completed");
    assert.deepStrictEqual(cold?.output, { message: "its cold outside" });

    assert.strictEqual(hot?.status, "completed");
    assert.deepStrictEqual(hot?.output, {
      skipped: true,
      reason: "Deferred condition evaluated to false",
    });
  });

  it("fails dependents of a failed task but keeps independent tasks running", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new TestTool());

    const engine = new ExecutionEngine(
      new ToolCapabilityExecutor(registry, new ToolExecutor()),
      new Scheduler(),
    );

    const tasks: Task[] = [
      {
        id: "call_1",
        type: "capability",
        capability: "tool.missing",
        input: {},
        status: "pending",
      },
      {
        id: "call_2",
        type: "capability",
        capability: "tool.test",
        input: { temp: "$call_1.temperature" },
        status: "pending",
        dependsOn: ["call_1"],
      },
      {
        id: "call_3",
        type: "capability",
        capability: "tool.test",
        input: { echo: "independent" },
        status: "pending",
      },
    ];

    const results = await engine.execute(tasks, {
      runId: "run-cascade-fail",
      agentId: "supervisor",
      allowedCapabilities: ["tool.test", "tool.missing"],
    });

    assert.strictEqual(results.length, 3);
    assert.strictEqual(results.find((r) => r.taskId === "call_1")?.status, "failed");

    const dependent = results.find((r) => r.taskId === "call_2");
    assert.strictEqual(dependent?.status, "failed");
    assert.match(dependent?.error ?? "", /Dependency 'call_1' failed/);

    // Independent task must not be affected by the failure
    const independent = results.find((r) => r.taskId === "call_3");
    assert.strictEqual(independent?.status, "completed");
  });

  it("cascades skips to dependents of condition-skipped tasks", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new TestTool());

    const engine = new ExecutionEngine(
      new ToolCapabilityExecutor(registry, new ToolExecutor()),
      new Scheduler(),
    );

    const tasks: Task[] = [
      {
        id: "call_1",
        type: "capability",
        capability: "tool.test",
        input: { temperature: 28, _condition: { left: 100, op: "<", right: 30 } },
        status: "pending",
      },
      {
        id: "call_2",
        type: "capability",
        capability: "tool.test",
        input: { followUp: "$call_1.temperature" },
        status: "pending",
        dependsOn: ["call_1"],
      },
    ];

    const results = await engine.execute(tasks, {
      runId: "run-cascade-skip",
      agentId: "supervisor",
      allowedCapabilities: ["tool.test"],
    });

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results.find((r) => r.taskId === "call_1")?.status, "completed");

    const dependent = results.find((r) => r.taskId === "call_2");
    assert.strictEqual(dependent?.status, "completed");
    assert.deepStrictEqual(dependent?.output, {
      skipped: true,
      reason: "Skipped because dependency 'call_1' was skipped",
    });
  });

  it("emits task:failed when ref resolution fails at execution time", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new TestTool());

    const eventBus = new HarnessEventBus();
    const failures: string[] = [];
    eventBus.on("task:failed", (event) => {
      failures.push(`${event.taskId}: ${event.error}`);
    });

    const engine = new ExecutionEngine(
      new ToolCapabilityExecutor(registry, new ToolExecutor()),
      new Scheduler(),
      eventBus,
    );

    const tasks: Task[] = [
      {
        id: "call_1",
        type: "capability",
        capability: "tool.test",
        input: { temperature: 28 },
        status: "pending",
      },
      {
        id: "call_2",
        type: "capability",
        capability: "tool.test",
        input: { temp: "$call_1.temperature.fahrenheit" },
        status: "pending",
        dependsOn: ["call_1"],
      },
    ];

    const results = await engine.execute(tasks, {
      runId: "run-resolution-fail",
      agentId: "supervisor",
      allowedCapabilities: ["tool.test"],
    });

    assert.strictEqual(results.find((r) => r.taskId === "call_1")?.status, "completed");

    const dependent = results.find((r) => r.taskId === "call_2");
    assert.strictEqual(dependent?.status, "failed");
    assert.match(dependent?.error ?? "", /segment 'fahrenheit' not found/);
    assert.ok(
      failures.some((entry) => entry.startsWith("call_2:") && entry.includes("fahrenheit")),
    );
  });
});

describe("DependencyGraph", () => {
  it("determines dependencies correctly", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        type: "capability",
        capability: "tool.test",
        input: {},
        status: "pending",
      },
      {
        id: "task-2",
        type: "capability",
        capability: "tool.test",
        input: {},
        status: "pending",
        dependsOn: ["task-1"],
      },
    ];

    const graph = new DependencyGraph(tasks);
    assert.deepStrictEqual(graph.getDependencies("task-2"), ["task-1"]);
    assert.deepStrictEqual(graph.getDependents("task-1"), ["task-2"]);
    assert.strictEqual(graph.hasCycle(), false);
  });

  it("detects direct and indirect cycles", () => {
    const directCycle: Task[] = [
      {
        id: "a",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["b"],
      },
      {
        id: "b",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["a"],
      },
    ];
    assert.strictEqual(new DependencyGraph(directCycle).hasCycle(), true);

    const indirectCycle: Task[] = [
      {
        id: "1",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["2"],
      },
      {
        id: "2",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["3"],
      },
      {
        id: "3",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["1"],
      },
    ];
    assert.strictEqual(new DependencyGraph(indirectCycle).hasCycle(), true);
  });

  it("evaluates satisfaction correctly", () => {
    const tasks: Task[] = [
      {
        id: "a",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["dep-1", "dep-2"],
      },
    ];
    const graph = new DependencyGraph(tasks);

    assert.strictEqual(graph.isSatisfied("a", new Set(["dep-1"])), false);
    assert.strictEqual(graph.isSatisfied("a", new Set(["dep-1", "dep-2"])), true);
  });
});

describe("Scheduler", () => {
  it("returns only pending tasks with satisfied dependencies", () => {
    const tasks: Task[] = [
      { id: "task-1", type: "capability", capability: "test", input: {}, status: "completed" },
      {
        id: "task-2",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["task-1"],
      },
      {
        id: "task-3",
        type: "capability",
        capability: "test",
        input: {},
        status: "pending",
        dependsOn: ["task-2"],
      },
    ];

    const scheduler = new Scheduler();
    const runnable = scheduler.getRunnableTasks(tasks);

    assert.strictEqual(runnable.length, 1);
    assert.strictEqual(runnable[0]?.id, "task-2");
  });
});

describe("ExecutionEngine with TestTool", () => {
  it("executes dependent tasks in topological order", async () => {
    const registry = new CapabilityRegistry();
    const tool = new TestTool();
    registry.register(tool);

    const toolExecutor = new ToolExecutor();
    const toolCapabilityExecutor = new ToolCapabilityExecutor(registry, toolExecutor);
    const scheduler = new Scheduler();
    const engine = new ExecutionEngine(toolCapabilityExecutor, scheduler);

    const tasks: Task[] = [
      {
        id: "test-1",
        type: "capability",
        capability: "tool.test",
        input: { expression: "5 + 5" },
        status: "pending",
      },
      {
        id: "test-2",
        type: "capability",
        capability: "tool.test",
        input: { expression: "10 * 10" },
        status: "pending",
        dependsOn: ["test-1"],
      },
    ];

    const results = await engine.execute(tasks, {
      runId: "test-run",
      agentId: "supervisor",
      allowedCapabilities: ["tool.test"],
    });

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0]?.taskId, "test-1");
    assert.deepStrictEqual(results[0]?.output, { expression: "5 + 5" });
    assert.strictEqual(results[1]?.taskId, "test-2");
    assert.deepStrictEqual(results[1]?.output, { expression: "10 * 10" });
  });

  it("throws on cyclic dependencies", async () => {
    const registry = new CapabilityRegistry();
    const toolCapabilityExecutor = new ToolCapabilityExecutor(registry, new ToolExecutor());
    const engine = new ExecutionEngine(toolCapabilityExecutor, new Scheduler());

    const cyclicTasks: Task[] = [
      {
        id: "t1",
        type: "capability",
        capability: "tool.test",
        input: { expression: "1" },
        status: "pending",
        dependsOn: ["t2"],
      },
      {
        id: "t2",
        type: "capability",
        capability: "tool.test",
        input: { expression: "2" },
        status: "pending",
        dependsOn: ["t1"],
      },
    ];

    await assert.rejects(
      () => engine.execute(cyclicTasks, { runId: "test", agentId: "test" }),
      /contains a cycle/,
    );
  });
});

describe("Orchestrator with StaticPlanGenerator and PlanValidator", () => {
  it("plans and executes tasks end-to-end", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new TestTool());

    const toolExecutor = new ToolExecutor();
    const toolCapabilityExecutor = new ToolCapabilityExecutor(registry, toolExecutor);
    const engine = new ExecutionEngine(toolCapabilityExecutor, new Scheduler());

    const planGenerator = new StaticPlanGenerator();
    const planner = new Planner(planGenerator);
    const validator = new PlanValidator(registry);
    const orchestrator = new Orchestrator(planner, engine, validator);

    const plan = await orchestrator.plan({
      toolCalls: [
        {
          id: "call-1",
          name: "tool.test",
          arguments: { expression: "3 * 3" },
        },
      ],
    });

    assert.strictEqual(plan.tasks.length, 1);
    assert.strictEqual(plan.tasks[0]?.id, "call-1");
    assert.deepStrictEqual(plan.tasks[0]?.dependsOn, []);

    const results = await orchestrator.execute(plan, {
      runId: "run-1",
      agentId: "test",
      allowedCapabilities: ["tool.test"],
    });
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0]?.output, { expression: "3 * 3" });
  });
});
