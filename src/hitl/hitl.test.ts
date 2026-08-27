import "reflect-metadata";

import assert from "node:assert";
import { promises as fs } from "node:fs";
import { describe, it } from "node:test";

import { SubAgentExecutor } from "../capabilities/agents/sub-agent-executor.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { CapabilityDispatcher } from "../capabilities/dispatch/capability-dispatcher.js";
import { Tool, ToolContext, ToolResult } from "../capabilities/tools/tool.js";
import { ToolCapabilityExecutor } from "../capabilities/tools/tool-capability-executor.js";
import { ToolExecutor } from "../capabilities/tools/tool-executor.js";
import { Agent } from "../core/agent/agent.js";
import { AgentConfig } from "../core/agent/agent-config.js";
import { AgentRegistry } from "../core/agent/agent-registry.js";
import { AgentRunner } from "../core/agent/agent-runner.js";
import { AgentHarness } from "../core/harness.js";
import { ExecutionEngine } from "../core/orchestration/execution-engine.js";
import { Orchestrator } from "../core/orchestration/orchestrator.js";
import { PlanValidator } from "../core/orchestration/plan-validator.js";
import { Planner } from "../core/orchestration/planner.js";
import { Scheduler } from "../core/orchestration/scheduler.js";
import { StaticPlanGenerator } from "../core/orchestration/static-plan-generator.js";
import { LLM, LLMRequest, LLMResponse } from "../llm/types.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { createApp } from "../server/app.js";
import { ApprovalManager } from "./approval-manager.js";
import { FileCheckpointStore, InMemoryCheckpointStore } from "./checkpoint-store.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: "v1",
      content: "You are a test HITL agent.",
    };
  },
};

class ScriptedLLM implements LLM {
  private callCount = 0;
  constructor(private readonly responses: LLMResponse[]) {}

  async chat(_request: LLMRequest): Promise<LLMResponse> {
    const response = this.responses[this.callCount];
    this.callCount++;
    if (!response) {
      return { content: "Default answer" };
    }
    return response;
  }
}

class SensitiveDatabaseTool implements Tool {
  public readonly id = "tool.delete_records";
  public readonly name = "Delete Records";
  public readonly description = "Deletes database records";
  public readonly type = "tool" as const;
  public readonly inputSchema = {
    type: "object",
    properties: { table: { type: "string" } },
    required: ["table"],
  };
  public readonly requiresApproval = true;

  async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
    const { table } = input as { table: string };
    return {
      success: true,
      output: { deletedFrom: table, count: 50 },
    };
  }
}

describe("CheckpointStore", () => {
  it("saves, retrieves, updates and deletes in InMemoryCheckpointStore", async () => {
    const store = new InMemoryCheckpointStore();
    const cp = {
      id: "token-1",
      runId: "run-100",
      agentId: "agent-1",
      taskId: "task-1",
      capability: "tool.delete_records",
      input: { table: "users" },
      status: "pending" as const,
      createdAt: Date.now(),
    };

    await store.save(cp);
    assert.strictEqual((await store.get("token-1"))?.runId, "run-100");
    assert.strictEqual((await store.getByRunId("run-100"))?.id, "token-1");

    await store.updateStatus("token-1", "approved", "Admin verified");
    const updated = await store.get("token-1");
    assert.strictEqual(updated?.status, "approved");
    assert.strictEqual(updated?.reason, "Admin verified");

    const pending = await store.list("pending");
    assert.strictEqual(pending.length, 0);

    const approved = await store.list("approved");
    assert.strictEqual(approved.length, 1);
  });

  it("persists checkpoints in FileCheckpointStore", async () => {
    const testDir = "./scratch/test-checkpoints";
    const store = new FileCheckpointStore(testDir);

    const cp = {
      id: "file-token-1",
      runId: "run-200",
      agentId: "agent-2",
      taskId: "task-2",
      capability: "tool.delete_records",
      input: { table: "orders" },
      status: "pending" as const,
      createdAt: Date.now(),
    };

    await store.save(cp);
    assert.strictEqual((await store.get("file-token-1"))?.taskId, "task-2");

    await store.updateStatus("file-token-1", "rejected", "Permission denied");
    const updated = await store.get("file-token-1");
    assert.strictEqual(updated?.status, "rejected");

    await store.delete("file-token-1");
    assert.strictEqual(await store.get("file-token-1"), null);

    await fs.rm(testDir, { recursive: true, force: true });
  });
});

describe("ApprovalManager", () => {
  it("resolves deferred approval decision when approved", async () => {
    const manager = new ApprovalManager();

    const decisionPromise = manager.requestApproval(
      "run-hitl-1",
      "agent-hitl",
      "task-del",
      "tool.delete_records",
      { table: "users" },
      5000,
    );

    const pending = await manager.listPending();
    assert.strictEqual(pending.length, 1);

    const res = await manager.resolveDecision("run-hitl-1", {
      status: "approved",
      reason: "Allowed by QA lead",
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.checkpoint?.status, "approved");

    const decision = await decisionPromise;
    assert.strictEqual(decision.status, "approved");
    assert.strictEqual(decision.reason, "Allowed by QA lead");
  });
});

describe("Agent & Orchestrator with HITL Approval Gate", () => {
  it("suspends execution on sensitive tool, resumes when approved", async () => {
    const registry = new CapabilityRegistry();
    const tool = new SensitiveDatabaseTool();
    registry.register(tool);

    const store = new InMemoryCheckpointStore();
    const approvalManager = new ApprovalManager(store);

    const planner = new Planner(new StaticPlanGenerator(), registry);
    const engine = new ExecutionEngine(
      new CapabilityDispatcher(
        registry,
        new ToolCapabilityExecutor(registry, new ToolExecutor()),
        new SubAgentExecutor(new AgentRegistry()),
      ),
      new Scheduler(),
      undefined,
      registry,
      approvalManager,
    );
    const orchestrator = new Orchestrator(planner, engine, new PlanValidator(registry));

    const config: AgentConfig = {
      id: "db-agent",
      name: "DB Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "db-prompt" },
      skills: [],
      tools: ["tool.delete_records"],
      subAgents: [],
    };

    const scriptedLLM = new ScriptedLLM([
      {
        content: "Deleting records",
        toolCalls: [
          {
            id: "call-del-1",
            name: "tool.delete_records",
            arguments: { table: "inactive_users" },
          },
        ],
      },
      {
        content: "Records deleted successfully.",
      },
    ]);

    const runner = new AgentRunner(config, scriptedLLM, registry, orchestrator);
    const agent = new Agent(config, mockPromptProvider, runner);

    const runId = "hitl-run-approved";

    // Start agent execution in background
    const runPromise = agent.run(
      { message: "Clean inactive users" },
      { runId, agentId: "db-agent" },
    );

    // Wait for checkpoint to be created
    await new Promise((r) => setTimeout(r, 50));

    const pending = await approvalManager.listPending();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0]?.runId, runId);

    // Approve the decision
    await approvalManager.resolveDecision(runId, {
      status: "approved",
      reason: "Approved by DBA lead",
    });

    const result = await runPromise;
    assert.strictEqual(result.response, "Records deleted successfully.");
  });

  it("fails task cleanly when rejected by human", async () => {
    const registry = new CapabilityRegistry();
    const tool = new SensitiveDatabaseTool();
    registry.register(tool);

    const store = new InMemoryCheckpointStore();
    const approvalManager = new ApprovalManager(store);

    const planner = new Planner(new StaticPlanGenerator(), registry);
    const engine = new ExecutionEngine(
      new CapabilityDispatcher(
        registry,
        new ToolCapabilityExecutor(registry, new ToolExecutor()),
        new SubAgentExecutor(new AgentRegistry()),
      ),
      new Scheduler(),
      undefined,
      registry,
      approvalManager,
    );
    const orchestrator = new Orchestrator(planner, engine, new PlanValidator(registry));

    const config: AgentConfig = {
      id: "db-agent-2",
      name: "DB Agent 2",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "db-prompt" },
      skills: [],
      tools: ["tool.delete_records"],
      subAgents: [],
    };

    const scriptedLLM = new ScriptedLLM([
      {
        content: "Deleting records",
        toolCalls: [
          {
            id: "call-del-2",
            name: "tool.delete_records",
            arguments: { table: "production_orders" },
          },
        ],
      },
      {
        content: "Operation was rejected.",
      },
    ]);

    const runner = new AgentRunner(config, scriptedLLM, registry, orchestrator);
    const agent = new Agent(config, mockPromptProvider, runner);

    const runId = "hitl-run-rejected";

    const runPromise = agent.run({ message: "Purge orders" }, { runId, agentId: "db-agent-2" });

    await new Promise((r) => setTimeout(r, 50));

    // Reject the decision
    await approvalManager.resolveDecision(runId, {
      status: "rejected",
      reason: "Blocked: cannot delete production orders",
    });

    const result = await runPromise;
    assert.strictEqual(result.response, "Operation was rejected.");
  });
});

describe("Hono Server Approval REST API", () => {
  it("lists pending approvals and approves/rejects via HTTP", async () => {
    const harness = await AgentHarness.init({
      tools: [],
      planGenerator: new StaticPlanGenerator(),
      promptProvider: mockPromptProvider,
    });

    const app = createApp(harness);

    // Register manual approval requirement in ApprovalManager
    const decisionPromise = harness.approvalManager.requestApproval(
      "api-run-999",
      "test-agent",
      "task-1",
      "tool.deploy",
      { env: "production" },
    );

    // List pending approvals via GET /v1/approvals
    const listRes = await app.request("/v1/approvals");
    assert.strictEqual(listRes.status, 200);
    const listData = (await listRes.json()) as {
      success: boolean;
      pending: Array<{ runId: string }>;
    };
    assert.strictEqual(listData.success, true);
    assert.ok(listData.pending.some((p) => p.runId === "api-run-999"));

    // Approve via POST /v1/runs/:id/approve
    const approveRes = await app.request("/v1/runs/api-run-999/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Release approved" }),
    });

    assert.strictEqual(approveRes.status, 200);
    const approveData = (await approveRes.json()) as {
      success: boolean;
      checkpoint: { status: string };
    };
    assert.strictEqual(approveData.success, true);
    assert.strictEqual(approveData.checkpoint.status, "approved");

    const decision = await decisionPromise;
    assert.strictEqual(decision.status, "approved");
  });
});
