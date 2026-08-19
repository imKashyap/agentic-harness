import assert from "node:assert";
import { describe, it } from "node:test";

import { SubAgentExecutor } from "../../capabilities/agents/sub-agent-executor.js";
import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityDispatcher } from "../../capabilities/execution/capability-dispatcher.js";
import { CalculatorTool } from "../../capabilities/tools/examples/calculator-tool.js";
import { ToolCallExecutor } from "../../capabilities/tools/tool-call-executor.js";
import { ToolExecutor } from "../../capabilities/tools/tool-executor.js";
import { LLM, LLMRequest, LLMResponse } from "../../llm/model.js";
import { PromptProvider } from "../../prompts/prompt-provider.js";
import { ExecutionEngine } from "../orchestration/execution-engine.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { Planner } from "../orchestration/planner.js";
import { Scheduler } from "../orchestration/scheduler.js";
import { Agent } from "./agent.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRegistry } from "./agent-registry.js";
import { AgentRunner } from "./agent-runner.js";

class ScriptedLLM implements LLM {
  private callCount = 0;
  constructor(private readonly responses: LLMResponse[]) {}

  async chat(_request: LLMRequest): Promise<LLMResponse> {
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

const baseConfig: AgentConfig = {
  id: "test-agent",
  name: "Test Agent",
  model: { provider: "mock", model: "mock-model" },
  prompt: { id: "test-prompt" },
  skills: [],
  tools: [],
  subAgents: [],
};

describe("Agent & AgentRunner", () => {
  it("executes single turn when no tool calls are returned", async () => {
    const registry = new CapabilityRegistry();
    const planner = new Planner();
    const toolExecutor = new ToolExecutor();
    const toolCallExecutor = new ToolCallExecutor(registry, toolExecutor);
    const subAgentExecutor = new SubAgentExecutor(new AgentRegistry());
    const dispatcher = new CapabilityDispatcher(registry, toolCallExecutor, subAgentExecutor);
    const engine = new ExecutionEngine(dispatcher, new Scheduler());
    const orchestrator = new Orchestrator(planner, engine);

    const scriptedLLM = new ScriptedLLM([{ content: "Hello, I am ready to help!" }]);
    const runner = new AgentRunner(baseConfig, scriptedLLM, registry, orchestrator);
    const agent = new Agent(baseConfig, mockPromptProvider, runner);

    const result = await agent.run({ message: "Hi" });
    assert.strictEqual(result.response, "Hello, I am ready to help!");
  });

  it("handles tool calling loop and maps tool result to message history", async () => {
    const registry = new CapabilityRegistry();
    registry.register(new CalculatorTool());

    const planner = new Planner();
    const toolExecutor = new ToolExecutor();
    const toolCallExecutor = new ToolCallExecutor(registry, toolExecutor);
    const subAgentExecutor = new SubAgentExecutor(new AgentRegistry());
    const dispatcher = new CapabilityDispatcher(registry, toolCallExecutor, subAgentExecutor);
    const engine = new ExecutionEngine(dispatcher, new Scheduler());
    const orchestrator = new Orchestrator(planner, engine);

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

    const runner = new AgentRunner(baseConfig, scriptedLLM, registry, orchestrator);
    const agent = new Agent(baseConfig, mockPromptProvider, runner);

    const result = await agent.run({ message: "What is 12 * 12?" });
    assert.strictEqual(result.response, "12 * 12 is 144.");
  });

  it("delegates to sub-agent through agent capability", async () => {
    const capabilityRegistry = new CapabilityRegistry();
    const agentRegistry = new AgentRegistry();
    const planner = new Planner();
    const toolExecutor = new ToolExecutor();
    const toolCallExecutor = new ToolCallExecutor(capabilityRegistry, toolExecutor);
    const subAgentExecutor = new SubAgentExecutor(agentRegistry);
    const dispatcher = new CapabilityDispatcher(
      capabilityRegistry,
      toolCallExecutor,
      subAgentExecutor,
    );
    const engine = new ExecutionEngine(dispatcher, new Scheduler());
    const orchestrator = new Orchestrator(planner, engine);

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

    // Parent agent that delegates to researcher
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

    const parentRunner = new AgentRunner(baseConfig, parentLLM, capabilityRegistry, orchestrator);
    const parentAgent = new Agent(baseConfig, mockPromptProvider, parentRunner);

    const result = await parentAgent.run({ message: "Research quantum computing" });
    assert.strictEqual(result.response, "According to research, quantum computing uses qubits.");
  });
});
