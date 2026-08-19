import assert from "node:assert";
import { describe, it } from "node:test";

import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CalculatorTool } from "../../capabilities/tools/examples/calculator-tool.js";
import { ToolCallExecutor } from "../../capabilities/tools/tool-call-executor.js";
import { ToolExecutor } from "../../capabilities/tools/tool-executor.js";
import { Task } from "../execution/task.js";
import { DependencyGraph } from "./dependency-graph.js";
import { ExecutionEngine } from "./execution-engine.js";
import { Orchestrator } from "./orchestrator.js";
import { PlanValidator } from "./plan-validator.js";
import { Planner } from "./planner.js";
import { Scheduler } from "./scheduler.js";
import { StaticPlanGenerator } from "./static-plan-generator.js";

describe("DependencyGraph", () => {
  it("determines dependencies correctly", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        type: "capability",
        capability: "tool.calculator",
        input: {},
        status: "pending",
      },
      {
        id: "task-2",
        type: "capability",
        capability: "tool.calculator",
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

describe("CalculatorTool", () => {
  const tool = new CalculatorTool();
  const context = { runId: "test-run", agentId: "test-agent" };

  it("evaluates valid arithmetic expressions", async () => {
    const res1 = await tool.execute({ expression: "2 + 2 * 3" }, context);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.output, 8);

    const res2 = await tool.execute({ expression: "2 ^ 3" }, context);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.output, 8);

    const res3 = await tool.execute({ expression: "(10 - 4) / 2" }, context);
    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.output, 3);
  });

  it("rejects invalid characters and dangerous expressions", async () => {
    const res = await tool.execute({ expression: "process.exit(1)" }, context);
    assert.strictEqual(res.success, false);
    assert.match(res.error ?? "", /invalid characters/i);
  });

  it("handles non-object and empty inputs gracefully", async () => {
    const res1 = await tool.execute(null, context);
    assert.strictEqual(res1.success, false);

    const res2 = await tool.execute({}, context);
    assert.strictEqual(res2.success, false);

    const res3 = await tool.execute({ expression: "   " }, context);
    assert.strictEqual(res3.success, false);
  });
});

describe("ExecutionEngine with CalculatorTool", () => {
  it("executes dependent tasks in topological order", async () => {
    const registry = new CapabilityRegistry();
    const tool = new CalculatorTool();
    registry.register(tool);

    const toolExecutor = new ToolExecutor();
    const toolCallExecutor = new ToolCallExecutor(registry, toolExecutor);
    const scheduler = new Scheduler();
    const engine = new ExecutionEngine(toolCallExecutor, scheduler);

    const tasks: Task[] = [
      {
        id: "calc-1",
        type: "capability",
        capability: "tool.calculator",
        input: { expression: "5 + 5" },
        status: "pending",
      },
      {
        id: "calc-2",
        type: "capability",
        capability: "tool.calculator",
        input: { expression: "10 * 10" },
        status: "pending",
        dependsOn: ["calc-1"],
      },
    ];

    const results = await engine.execute(tasks, { runId: "test-run", agentId: "default-agent" });

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0]?.taskId, "calc-1");
    assert.strictEqual(results[0]?.output, 10);
    assert.strictEqual(results[1]?.taskId, "calc-2");
    assert.strictEqual(results[1]?.output, 100);
  });

  it("throws on cyclic dependencies", async () => {
    const registry = new CapabilityRegistry();
    const toolCallExecutor = new ToolCallExecutor(registry, new ToolExecutor());
    const engine = new ExecutionEngine(toolCallExecutor, new Scheduler());

    const cyclicTasks: Task[] = [
      {
        id: "t1",
        type: "capability",
        capability: "tool.calculator",
        input: { expression: "1" },
        status: "pending",
        dependsOn: ["t2"],
      },
      {
        id: "t2",
        type: "capability",
        capability: "tool.calculator",
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
    registry.register(new CalculatorTool());

    const toolExecutor = new ToolExecutor();
    const toolCallExecutor = new ToolCallExecutor(registry, toolExecutor);
    const engine = new ExecutionEngine(toolCallExecutor, new Scheduler());

    const planGenerator = new StaticPlanGenerator();
    const planner = new Planner(planGenerator, registry);
    const validator = new PlanValidator(registry);
    const orchestrator = new Orchestrator(planner, engine, validator);

    const plan = await orchestrator.plan({
      toolCalls: [
        {
          id: "call-1",
          name: "tool.calculator",
          arguments: { expression: "3 * 3" },
        },
      ],
    });

    assert.strictEqual(plan.tasks.length, 1);
    assert.strictEqual(plan.tasks[0]?.id, "call-1");
    assert.deepStrictEqual(plan.tasks[0]?.dependsOn, []);

    const results = await orchestrator.execute(plan, { runId: "run-1", agentId: "test" });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0]?.output, 9);
  });
});
