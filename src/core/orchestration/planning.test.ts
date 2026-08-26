import assert from "node:assert";
import { describe, it } from "node:test";

import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CalculatorTool } from "../../capabilities/tools/examples/calculator-tool.js";
import { LLM, LLMRequest, LLMResponse } from "../../llm/types.js";
import { AdaptivePlanGenerator } from "./adaptive-plan-generator.js";
import { LLMPlanGenerator } from "./llm-plan-generator.js";
import { PlanValidator } from "./plan-validator.js";
import { Planner } from "./planner.js";
import { StaticPlanGenerator } from "./static-plan-generator.js";

class MockPlannerLLM implements LLM {
  public lastRequest?: LLMRequest;
  public callCount = 0;

  constructor(private readonly responseContent: string) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.callCount++;
    this.lastRequest = request;
    return {
      content: this.responseContent,
    };
  }
}

describe("StaticPlanGenerator", () => {
  it("generates independent plan steps for all tool calls", async () => {
    const generator = new StaticPlanGenerator();
    const steps = await generator.generate({
      toolCalls: [
        { id: "call-1", name: "tool.calculator", arguments: { expression: "1 + 1" } },
        { id: "call-2", name: "tool.calculator", arguments: { expression: "2 + 2" } },
      ],
    });

    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps[0]?.id, "call-1");
    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    assert.strictEqual(steps[1]?.id, "call-2");
    assert.deepStrictEqual(steps[1]?.dependsOn, []);
  });
});

describe("AdaptivePlanGenerator (Fast-Path Hybrid)", () => {
  it("fast-path: skips LLM call entirely when toolCalls count is 0 or 1", async () => {
    const staticGen = new StaticPlanGenerator();
    const mockLLM = new MockPlannerLLM(JSON.stringify({ steps: [] }));
    const llmGen = new LLMPlanGenerator(mockLLM);
    const adaptiveGen = new AdaptivePlanGenerator(staticGen, llmGen);

    const steps = await adaptiveGen.generate({
      toolCalls: [
        { id: "single-call", name: "tool.calculator", arguments: { expression: "5 * 5" } },
      ],
    });

    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0]?.id, "single-call");
    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    // Ensure LLM was NEVER invoked (0ms fast path)
    assert.strictEqual(mockLLM.callCount, 0);
  });

  it("dynamic-path: invokes LLM planner when toolCalls count > 1", async () => {
    const staticGen = new StaticPlanGenerator();
    const mockLLM = new MockPlannerLLM(
      JSON.stringify({
        steps: [
          { id: "c1", toolCallId: "call-1", dependsOn: [] },
          { id: "c2", toolCallId: "call-2", dependsOn: ["c1"] },
        ],
      }),
    );
    const llmGen = new LLMPlanGenerator(mockLLM);
    const adaptiveGen = new AdaptivePlanGenerator(staticGen, llmGen);

    const steps = await adaptiveGen.generate({
      toolCalls: [
        { id: "call-1", name: "tool.calculator", arguments: { expression: "2 + 2" } },
        { id: "call-2", name: "tool.calculator", arguments: { expression: "4 * 4" } },
      ],
    });

    assert.strictEqual(steps.length, 2);
    assert.strictEqual(mockLLM.callCount, 1);
    assert.deepStrictEqual(steps[1]?.dependsOn, ["c1"]);
  });

  it("fallback: falls back to static parallel plan when LLM planner throws", async () => {
    const staticGen = new StaticPlanGenerator();
    const brokenLLM = new MockPlannerLLM("invalid json");
    const llmGen = new LLMPlanGenerator(brokenLLM);
    const adaptiveGen = new AdaptivePlanGenerator(staticGen, llmGen, {
      fallbackToStaticOnError: true,
    });

    const steps = await adaptiveGen.generate({
      toolCalls: [
        { id: "call-1", name: "tool.calculator", arguments: {} },
        { id: "call-2", name: "tool.calculator", arguments: {} },
      ],
    });

    assert.strictEqual(steps.length, 2);
    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    assert.deepStrictEqual(steps[1]?.dependsOn, []);
  });
});

describe("LLMPlanGenerator (Capability-Aware)", () => {
  it("passes capability metadata and arguments to LLM prompt", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new CalculatorTool());
    registry.register({
      id: "agent.researcher",
      name: "Researcher",
      description: "Research agent that looks up factual information",
      type: "agent",
      metadata: {},
    });

    const mockResponse = JSON.stringify({
      steps: [
        { id: "step-1", toolCallId: "call-research", dependsOn: [] },
        { id: "step-2", toolCallId: "call-calc", dependsOn: ["step-1"] },
      ],
    });

    const mockLLM = new MockPlannerLLM(mockResponse);
    const generator = new LLMPlanGenerator(mockLLM, registry);

    const steps = await generator.generate({
      toolCalls: [
        {
          id: "call-research",
          name: "agent.researcher",
          arguments: { task: "Find earth diameter" },
        },
        { id: "call-calc", name: "tool.calculator", arguments: { expression: "12742 * 3.14159" } },
      ],
    });

    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps[0]?.id, "step-1");
    assert.deepStrictEqual(steps[0]?.dependsOn, []);
    assert.strictEqual(steps[1]?.id, "step-2");
    assert.deepStrictEqual(steps[1]?.dependsOn, ["step-1"]);

    // Verify capability awareness in the prompt sent to LLM
    const userPrompt = mockLLM.lastRequest?.messages.find((m) => m.role === "user")?.content ?? "";
    assert.match(userPrompt, /agent\.researcher/);
    assert.match(userPrompt, /tool\.calculator/);
    assert.match(userPrompt, /Research agent that looks up factual information/);
  });

  it("handles markdown code fence JSON responses", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new CalculatorTool());

    const fencedResponse =
      "```json\n" +
      JSON.stringify({
        steps: [{ id: "call-1", toolCallId: "call-1", dependsOn: [] }],
      }) +
      "\n```";

    const mockLLM = new MockPlannerLLM(fencedResponse);
    const generator = new LLMPlanGenerator(mockLLM, registry);

    const steps = await generator.generate({
      toolCalls: [{ id: "call-1", name: "tool.calculator", arguments: { expression: "10 * 2" } }],
    });

    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0]?.id, "call-1");
  });

  it("throws when LLM returns invalid JSON or references unknown toolCallId", async () => {
    const registry = new CapabilityRegistry();
    const generator = new LLMPlanGenerator(new MockPlannerLLM("not valid json"), registry);

    await assert.rejects(
      () =>
        generator.generate({ toolCalls: [{ id: "c1", name: "tool.calculator", arguments: {} }] }),
      /invalid JSON/i,
    );

    const badIdGenerator = new LLMPlanGenerator(
      new MockPlannerLLM(
        JSON.stringify({ steps: [{ id: "s1", toolCallId: "unknown-id", dependsOn: [] }] }),
      ),
      registry,
    );

    await assert.rejects(
      () =>
        badIdGenerator.generate({
          toolCalls: [{ id: "c1", name: "tool.calculator", arguments: {} }],
        }),
      /unknown toolCallId/i,
    );
  });
});

describe("PlanValidator (Capability-Aware)", () => {
  const registry = new CapabilityRegistry();
  registry.register(new CalculatorTool());
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
            capability: "tool.calculator",
            input: {},
            status: "pending",
          },
          {
            id: "t2",
            type: "capability",
            capability: "tool.calculator",
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
            capability: "tool.calculator",
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
            capability: "tool.calculator",
            input: {},
            status: "pending",
            dependsOn: ["b"],
          },
          {
            id: "b",
            type: "capability",
            capability: "tool.calculator",
            input: {},
            status: "pending",
            dependsOn: ["a"],
          },
        ],
      });
    }, /Dependency cycle detected/);
  });
});

describe("Planner with CapabilityRegistry", () => {
  it("enriches request and creates execution plan", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new CalculatorTool());

    const planGenerator = new StaticPlanGenerator();
    const planner = new Planner(planGenerator, registry);

    const plan = await planner.createPlan({
      toolCalls: [{ id: "calc-1", name: "tool.calculator", arguments: { expression: "5 + 5" } }],
    });

    assert.strictEqual(plan.tasks.length, 1);
    assert.strictEqual(plan.tasks[0]?.capability, "tool.calculator");
    assert.strictEqual(plan.tasks[0]?.status, "pending");
  });
});
