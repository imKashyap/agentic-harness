import assert from "node:assert";
import { describe, it } from "node:test";

import { SubAgentExecutor } from "../../capabilities/agents/sub-agent-executor.js";
import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityDispatcher } from "../../capabilities/execution/capability-dispatcher.js";
import { Skill } from "../../capabilities/skills/skill.js";
import { CalculatorTool } from "../../capabilities/tools/examples/calculator-tool.js";
import { Tool } from "../../capabilities/tools/tool.js";
import { ToolCallExecutor } from "../../capabilities/tools/tool-call-executor.js";
import { ToolExecutor } from "../../capabilities/tools/tool-executor.js";
import { LLM, LLMRequest, LLMResponse } from "../../llm/model.js";
import { PromptProvider } from "../../prompts/prompt-provider.js";
import { ExecutionEngine } from "../orchestration/execution-engine.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { PlanValidator } from "../orchestration/plan-validator.js";
import { Planner } from "../orchestration/planner.js";
import { Scheduler } from "../orchestration/scheduler.js";
import { StaticPlanGenerator } from "../orchestration/static-plan-generator.js";
import { Agent } from "./agent.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRegistry } from "./agent-registry.js";
import { AgentRunner } from "./agent-runner.js";

class ScriptedLLM implements LLM {
  public lastRequest?: LLMRequest;
  public requests: LLMRequest[] = [];
  private callCount = 0;

  constructor(private readonly responses: LLMResponse[]) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.lastRequest = request;
    this.requests.push(request);
    const response = this.responses[this.callCount];
    this.callCount++;
    if (!response) {
      return { content: "Default final answer" };
    }
    return response;
  }
}

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return { id: req.id, version: req.version ?? "v1", content: "You are a test agent." };
  },
};

describe("Agent & AgentRunner with Scoping and Skill Injection", () => {
  it("scopes tools and sub-agents strictly to those declared in AgentConfig", async () => {
    const registry = new CapabilityRegistry();
    // Register 2 tools
    registry.register(new CalculatorTool());
    const formatterTool: Tool = {
      id: "tool.formatter",
      name: "Formatter",
      description: "Format string output",
      type: "tool",
      inputSchema: { type: "object" },
      metadata: {},
      execute: async () => ({ success: true, output: "formatted" }),
    };
    registry.register(formatterTool);

    // Register 2 agents
    registry.register({
      id: "agent.researcher",
      name: "Researcher",
      description: "Research agent",
      type: "agent",
      metadata: {},
    });
    registry.register({
      id: "agent.writer",
      name: "Writer",
      description: "Writer agent",
      type: "agent",
      metadata: {},
    });

    const planner = new Planner(new StaticPlanGenerator(), registry);
    const engine = new ExecutionEngine(
      new CapabilityDispatcher(
        registry,
        new ToolCallExecutor(registry, new ToolExecutor()),
        new SubAgentExecutor(new AgentRegistry()),
      ),
      new Scheduler(),
    );
    const orchestrator = new Orchestrator(planner, engine, new PlanValidator(registry));

    // Agent configured with ONLY calculator tool and researcher sub-agent
    const scopedConfig: AgentConfig = {
      id: "scoped-agent",
      name: "Scoped Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "scoped-prompt" },
      skills: [],
      tools: ["tool.calculator"],
      subAgents: ["agent.researcher"],
    };

    const scriptedLLM = new ScriptedLLM([{ content: "I will use my scoped capabilities." }]);
    const runner = new AgentRunner(scopedConfig, scriptedLLM, registry, orchestrator);
    const agent = new Agent(scopedConfig, mockPromptProvider, runner);

    await agent.run({ message: "Hello" });

    assert.ok(scriptedLLM.lastRequest);
    // Tools should ONLY include tool.calculator (formatter is excluded)
    assert.strictEqual(scriptedLLM.lastRequest.tools?.length, 1);
    assert.strictEqual(scriptedLLM.lastRequest.tools?.[0]?.name, "tool.calculator");

    // Agents should ONLY include agent.researcher (writer is excluded)
    assert.strictEqual(scriptedLLM.lastRequest.agents?.length, 1);
    assert.strictEqual(scriptedLLM.lastRequest.agents?.[0]?.name, "agent.researcher");
  });

  it("injects configured skill instructions into the system prompt", async () => {
    const registry = new CapabilityRegistry();
    const greetingSkill: Skill = {
      id: "skill.greeting",
      name: "Greeting",
      description: "Handles greetings politely",
      type: "skill",
      content: "- Always say welcome.\n- Keep greeting under 10 words.",
      metadata: {},
    };
    registry.register(greetingSkill);

    const planner = new Planner(new StaticPlanGenerator(), registry);
    const engine = new ExecutionEngine(
      new CapabilityDispatcher(
        registry,
        new ToolCallExecutor(registry, new ToolExecutor()),
        new SubAgentExecutor(new AgentRegistry()),
      ),
      new Scheduler(),
    );
    const orchestrator = new Orchestrator(planner, engine, new PlanValidator(registry));

    const skillConfig: AgentConfig = {
      id: "friendly-agent",
      name: "Friendly Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "friendly-prompt" },
      skills: ["skill.greeting"],
      tools: [],
      subAgents: [],
    };

    const scriptedLLM = new ScriptedLLM([{ content: "Welcome! How can I help?" }]);
    const runner = new AgentRunner(skillConfig, scriptedLLM, registry, orchestrator);
    const agent = new Agent(skillConfig, mockPromptProvider, runner);

    await agent.run({ message: "Hi there" });

    assert.ok(scriptedLLM.lastRequest);
    const systemMessage =
      scriptedLLM.lastRequest.messages.find((m) => m.role === "system")?.content ?? "";

    assert.match(systemMessage, /You are a test agent\./);
    assert.match(systemMessage, /Assigned Skills & Guidelines/);
    assert.match(systemMessage, /Skill: Greeting \(skill\.greeting\)/);
    assert.match(systemMessage, /Always say welcome\./);
  });

  it("handles tool calling loop and maps tool result to message history", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new CalculatorTool());

    const planner = new Planner(new StaticPlanGenerator(), registry);
    const toolExecutor = new ToolExecutor();
    const toolCallExecutor = new ToolCallExecutor(registry, toolExecutor);
    const subAgentExecutor = new SubAgentExecutor(new AgentRegistry());
    const dispatcher = new CapabilityDispatcher(registry, toolCallExecutor, subAgentExecutor);
    const engine = new ExecutionEngine(dispatcher, new Scheduler());
    const validator = new PlanValidator(registry);
    const orchestrator = new Orchestrator(planner, engine, validator);

    const config: AgentConfig = {
      id: "calc-agent",
      name: "Calculator Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "calc-prompt" },
      skills: [],
      tools: ["tool.calculator"],
      subAgents: [],
    };

    const scriptedLLM = new ScriptedLLM([
      {
        content: "Let me calculate that.",
        toolCalls: [
          {
            id: "call-1",
            name: "tool.calculator",
            arguments: { expression: "12 * 12" },
          },
        ],
      },
      {
        content: "12 * 12 is 144.",
      },
    ]);

    const runner = new AgentRunner(config, scriptedLLM, registry, orchestrator);
    const agent = new Agent(config, mockPromptProvider, runner);

    const result = await agent.run({ message: "What is 12 * 12?" });
    assert.strictEqual(result.response, "12 * 12 is 144.");
  });

  it("delegates to sub-agent through agent capability", async () => {
    const capabilityRegistry = new CapabilityRegistry();
    const agentRegistry = new AgentRegistry();
    const planner = new Planner(new StaticPlanGenerator(), capabilityRegistry);
    const toolExecutor = new ToolExecutor();
    const toolCallExecutor = new ToolCallExecutor(capabilityRegistry, toolExecutor);
    const subAgentExecutor = new SubAgentExecutor(agentRegistry);
    const dispatcher = new CapabilityDispatcher(
      capabilityRegistry,
      toolCallExecutor,
      subAgentExecutor,
    );
    const engine = new ExecutionEngine(dispatcher, new Scheduler());
    const validator = new PlanValidator(capabilityRegistry);
    const orchestrator = new Orchestrator(planner, engine, validator);

    // Register researcher agent
    const researcherConfig: AgentConfig = {
      id: "researcher",
      name: "Researcher",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "researcher" },
      skills: [],
      tools: [],
      subAgents: [],
    };
    const researcherLLM = new ScriptedLLM([
      { content: "Research result: Quantum computing uses qubits." },
    ]);
    const researcherRunner = new AgentRunner(
      researcherConfig,
      researcherLLM,
      capabilityRegistry,
      orchestrator,
    );
    const researcherAgent = new Agent(researcherConfig, mockPromptProvider, researcherRunner);
    agentRegistry.register("researcher", researcherAgent);

    capabilityRegistry.register({
      id: "agent.researcher",
      name: "Researcher",
      description: "Research agent",
      type: "agent",
      metadata: {},
    });

    const parentConfig: AgentConfig = {
      id: "parent-agent",
      name: "Parent Agent",
      model: { provider: "mock", model: "mock-model" },
      prompt: { id: "parent-prompt" },
      skills: [],
      tools: [],
      subAgents: ["agent.researcher"],
    };

    const parentLLM = new ScriptedLLM([
      {
        content: "Delegating research to sub-agent.",
        toolCalls: [
          {
            id: "sub-1",
            name: "agent.researcher",
            arguments: { task: "Explain quantum computing basics" },
          },
        ],
      },
      {
        content: "According to research, quantum computing uses qubits.",
      },
    ]);

    const parentRunner = new AgentRunner(parentConfig, parentLLM, capabilityRegistry, orchestrator);
    const parentAgent = new Agent(parentConfig, mockPromptProvider, parentRunner);

    const result = await parentAgent.run({ message: "Research quantum computing" });
    assert.strictEqual(result.response, "According to research, quantum computing uses qubits.");
  });
});
