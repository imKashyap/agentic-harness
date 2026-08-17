import "dotenv/config";
import { CapabilityManager } from "./capabilities/capability-manager.js";
import { CapabilityRegistry } from "./capabilities/capability-registry.js";
import { SkillLoader } from "./capabilities/skills/skill-loader.js";
import { ToolCallExecutor } from "./capabilities/tools/tool-call-executor.js";
import { ToolExecutor } from "./capabilities/tools/tool-executor.js";
import { AgentConfigLoader } from "./core/agent/agent-config-loader.js";
import { AgentRunner } from "./core/agent/agent-runner.js";
import { Agent } from "./core/agent/agent.js";
import { LLMFactory } from "./llm/llm-factory.js";
import { FilePromptProvider } from "./prompts/file-prompt-provider.js";

const configLoader = new AgentConfigLoader();
const config = await configLoader.load("./agents/default-agent/agent.json");

const llm = LLMFactory.create(config.model);

const promptProvider = new FilePromptProvider("./prompts/agents");

const capabilityRegistry = new CapabilityRegistry();

const capabilityManager = new CapabilityManager(capabilityRegistry, [new SkillLoader("./skills")]);

const toolExecutor = new ToolExecutor();

const toolCallExecutor = new ToolCallExecutor(capabilityRegistry, toolExecutor);

await capabilityManager.load();

const runner = new AgentRunner(config, llm, capabilityRegistry, toolCallExecutor);

const agent = new Agent(config, promptProvider, runner);
const result = await agent.run({
  message: "2 + 5",
});

console.log(result.response);
