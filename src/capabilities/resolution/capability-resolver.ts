import { AgentCapability } from "../agents/agent-capability.js";
import { Capability } from "../capability.js";
import { Skill } from "../skills/skill.js";
import { Tool } from "../tools/tool.js";
import { LLMCapabilityContext } from "./llm-capability.js";

export class CapabilityResolver {
  resolveForLLM(capabilities: Capability[]): LLMCapabilityContext {
    return {
      skills: capabilities
        .filter((capability): capability is Skill => capability.type === "skill")
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
        })),

      tools: capabilities
        .filter((capability): capability is Tool => capability.type === "tool")
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),

      agents: capabilities
        .filter((capability): capability is AgentCapability => capability.type === "agent")
        .map((agent) => ({
          name: agent.name,
          description: agent.description,
        })),
    };
  }
}
