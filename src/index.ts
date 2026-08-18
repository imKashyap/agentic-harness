import "dotenv/config";

import { AgentCapabilityLoader } from "./capabilities/agents/agent-capability-loader.js";
import { SubAgentExecutor } from "./capabilities/agents/sub-agent-executor.js";
import { CapabilityManager } from "./capabilities/capability-manager.js";
import { CapabilityRegistry } from "./capabilities/capability-registry.js";
import { CapabilityDispatcher } from "./capabilities/execution/capability-dispatcher.js";
import { SkillLoader } from "./capabilities/skills/skill-loader.js";
import { ToolCallExecutor } from "./capabilities/tools/tool-call-executor.js";
import { ToolExecutor } from "./capabilities/tools/tool-executor.js";
import { AgentConfigLoader } from "./core/agent/agent-config-loader.js";
import { AgentFactory } from "./core/agent/agent-factory.js";
import { AgentRegistry } from "./core/agent/agent-registry.js";
import { FilePromptProvider } from "./prompts/file-prompt-provider.js";

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

// ─────────────────────────────────────
// Agent construction
// ─────────────────────────────────────

const agentFactory = new AgentFactory(capabilityRegistry, capabilityExecutor, promptProvider);

const defaultAgent = agentFactory.create(config);
const researcherAgent = agentFactory.create(researcherConfig);

agentRegistry.register(config.id, defaultAgent);
agentRegistry.register(researcherConfig.id, researcherAgent);

// ─────────────────────────────────────
// Run
// ─────────────────────────────────────

const result = await defaultAgent.run({
  message: "2 + 5",
});

console.log(result.response);
