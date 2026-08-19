import { AgentConfig } from "../../core/agent/agent-config.js";
import { createLogger } from "../../utils/logger.js";
import { AgentCapability } from "../agents/agent-capability.js";
import { Capability } from "../capability.js";
import { CapabilityRegistry } from "../capability-registry.js";
import { Skill } from "../skills/skill.js";
import { Tool } from "../tools/tool.js";
import { LLMCapabilityContext } from "./llm-capability.js";

const logger = createLogger("CapabilityResolver");

export class CapabilityResolver {
  resolveToolsForAgent(config: AgentConfig, registry: CapabilityRegistry): Tool[] {
    const tools: Tool[] = [];

    for (const toolRef of config.tools) {
      if (registry.has(toolRef)) {
        try {
          const tool = registry.getTool(toolRef);
          tools.push(tool);
        } catch (error) {
          logger.warn(
            `Agent '${config.id}' configured tool '${toolRef}' could not be resolved as a tool: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else {
        logger.warn(`Agent '${config.id}' references unregistered tool '${toolRef}'`);
      }
    }

    logger.debug(
      `Resolved ${tools.length}/${config.tools.length} tool(s) for agent '${config.id}'`,
    );
    return tools;
  }

  resolveAgentsForAgent(config: AgentConfig, registry: CapabilityRegistry): AgentCapability[] {
    const rawAgentId = config.id.startsWith("agent.") ? config.id.slice(6) : config.id;
    const agents: AgentCapability[] = [];

    for (const agentRef of config.subAgents) {
      const normalizedRef = agentRef.startsWith("agent.") ? agentRef.slice(6) : agentRef;
      if (normalizedRef === rawAgentId) {
        logger.warn(`Agent '${config.id}' attempted self-delegation in subAgents config`);
        continue;
      }

      if (registry.has(agentRef)) {
        try {
          const agentCap = registry.getAgent(agentRef);
          agents.push(agentCap);
        } catch (error) {
          logger.warn(
            `Agent '${config.id}' configured sub-agent '${agentRef}' could not be resolved: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else {
        logger.warn(`Agent '${config.id}' references unregistered sub-agent '${agentRef}'`);
      }
    }

    logger.debug(
      `Resolved ${agents.length}/${config.subAgents.length} sub-agent(s) for agent '${config.id}'`,
    );
    return agents;
  }

  resolveSkillsForAgent(config: AgentConfig, registry: CapabilityRegistry): Skill[] {
    const skills: Skill[] = [];

    for (const skillRef of config.skills) {
      if (registry.has(skillRef)) {
        try {
          const skill = registry.getSkill(skillRef);
          skills.push(skill);
        } catch (error) {
          logger.warn(
            `Agent '${config.id}' configured skill '${skillRef}' could not be resolved: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else {
        logger.warn(`Agent '${config.id}' references unregistered skill '${skillRef}'`);
      }
    }

    logger.debug(
      `Resolved ${skills.length}/${config.skills.length} skill(s) for agent '${config.id}'`,
    );
    return skills;
  }

  formatSkillsPrompt(skills: Skill[]): string {
    if (skills.length === 0) {
      return "";
    }

    const sections = skills.map((skill) => {
      return `### Skill: ${skill.name} (${skill.id})\n${skill.description}\n\n${skill.content.trim()}`;
    });

    return `\n\n## Assigned Skills & Guidelines\nYou have access to the following domain skills and instructions. Follow them when relevant:\n\n${sections.join(
      "\n\n---\n\n",
    )}`;
  }

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
