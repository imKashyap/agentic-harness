import { createLogger } from "../../utils/logger.js";
import { AgentCapability } from "../agents/agent-capability.js";
import { Capability } from "../capability.js";
import { Skill } from "../skills/skill.js";
import { Tool } from "../tools/tool.js";
import { LLMCapabilityContext } from "./llm-capability.js";

const logger = createLogger("CapabilityResolver");

export class CapabilityResolver {
  resolveForLLM(capabilities: Capability[]): LLMCapabilityContext {
    const skills = capabilities
      .filter((capability): capability is Skill => capability.type === "skill")
      .map((skill) => ({
        name: skill.id,
        description: skill.description,
      }));

    const tools = capabilities
      .filter((capability): capability is Tool => capability.type === "tool")
      .map((tool) => ({
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

    const agents = capabilities
      .filter((capability): capability is AgentCapability => capability.type === "agent")
      .map((agent) => ({
        name: agent.id,
        description: agent.description,
      }));

    logger.debug(
      `Resolved capabilities for LLM: ${skills.length} skill(s), ${tools.length} tool(s), ${agents.length} agent(s)`,
    );

    return {
      skills,
      tools,
      agents,
    };
  }
}
