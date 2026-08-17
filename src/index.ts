import "dotenv/config";
import { AgentConfig } from "./core/agent/agent-config.js";
import { Agent } from "./core/agent/agent.js";
import { LLMFactory } from "./llm/llm-factory.js";
import { FilePromptProvider } from "./prompts/file-prompt-provider.js";

const config: AgentConfig = {
  id: "default-agent",
  name: "Default Agent",
  description: "My first agent",

  model: {
    provider: "openrouter",
    model: "gemma-4-31b-it",

    generation: {
      temperature: 0.7,
      maxTokens: 1024,
    },
  },

  prompt: {
    id: "default-agent",
    version: "v1",
  },

  skills: [],
  tools: [],
  subAgents: [],
};

const llm = LLMFactory.create(config.model);

const promptProvider = new FilePromptProvider(
  "./prompts/agents",
);

const agent = new Agent(
  config,
  llm,
  promptProvider,
);

const result = await agent.run({
  message: "Hello agent",
});

console.log(result.response);
