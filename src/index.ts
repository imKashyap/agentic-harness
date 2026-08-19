import "dotenv/config";

import { AgentCapabilityLoader } from "./capabilities/agents/agent-capability-loader.js";
import { SubAgentExecutor } from "./capabilities/agents/sub-agent-executor.js";
import { CapabilityManager } from "./capabilities/capability-manager.js";
import { CapabilityRegistry } from "./capabilities/capability-registry.js";
import { CapabilityDispatcher } from "./capabilities/execution/capability-dispatcher.js";
import { SkillLoader } from "./capabilities/skills/skill-loader.js";
import { CalculatorTool } from "./capabilities/tools/examples/calculator-tool.js";
import { ToolCallExecutor } from "./capabilities/tools/tool-call-executor.js";
import { ToolExecutor } from "./capabilities/tools/tool-executor.js";
import { ToolLoader } from "./capabilities/tools/tool-loader.js";
import { AgentConfigLoader } from "./core/agent/agent-config-loader.js";
import { AgentFactory } from "./core/agent/agent-factory.js";
import { AgentRegistry } from "./core/agent/agent-registry.js";
import { ExecutionEngine } from "./core/orchestration/execution-engine.js";
import { Orchestrator } from "./core/orchestration/orchestrator.js";
import { Planner } from "./core/orchestration/planner.js";
import { Scheduler } from "./core/orchestration/scheduler.js";
import { FilePromptProvider } from "./prompts/file-prompt-provider.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("Bootstrap");

try {
  logger.info("Initializing Agentic Harness...");

  const configLoader = new AgentConfigLoader();
  const config = await configLoader.load("./agents/default-agent/agent.json");
  const researcherConfig = await configLoader.load("./agents/researcher/agent.json");

  const promptProvider = new FilePromptProvider("./prompts/agents");

  // ─────────────────────────────────────
  // Registries
  // ─────────────────────────────────────

  const capabilityRegistry = new CapabilityRegistry();
  const agentRegistry = new AgentRegistry();

  // ─────────────────────────────────────
  // Capability discovery
  // ─────────────────────────────────────

  const capabilityManager = new CapabilityManager(capabilityRegistry, [
    new SkillLoader("./skills"),
    new AgentCapabilityLoader("./agents"),
    new ToolLoader([new CalculatorTool()]),
  ]);

  await capabilityManager.load();

  // ─────────────────────────────────────
  // Capability execution
  // ─────────────────────────────────────

  const toolExecutor = new ToolExecutor();
  const toolCallExecutor = new ToolCallExecutor(capabilityRegistry, toolExecutor);
  const subAgentExecutor = new SubAgentExecutor(agentRegistry);

  const capabilityExecutor = new CapabilityDispatcher(
    capabilityRegistry,
    toolCallExecutor,
    subAgentExecutor,
  );

  const scheduler = new Scheduler();
  const planner = new Planner();
  const executionEngine = new ExecutionEngine(capabilityExecutor, scheduler);
  const orchestrator = new Orchestrator(planner, executionEngine);

  // ─────────────────────────────────────
  // Agent construction
  // ─────────────────────────────────────

  const agentFactory = new AgentFactory(capabilityRegistry, orchestrator, promptProvider);
  const defaultAgent = agentFactory.create(config);
  const researcherAgent = agentFactory.create(researcherConfig);

  agentRegistry.register(config.id, defaultAgent);
  agentRegistry.register(researcherConfig.id, researcherAgent);

  // ─────────────────────────────────────
  // Run
  // ─────────────────────────────────────

  const input = process.env.AGENT_INPUT ?? "Hello";
  logger.info(`Running default agent with input: "${input}"`);

  const result = await defaultAgent.run({
    message: input,
  });

  logger.info("Agent run completed successfully");
  console.log(result.response);
} catch (error) {
  logger.error(
    `Application fatal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
}
