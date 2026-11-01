import { injectable } from "inversify";

import { AgentConfig } from "../../core/agent/agent-config.js";
import { createLogger } from "../../utils/logger.js";
import { AgentCapability } from "../agents/agent-capability.js";
import { Capability } from "../capability.js";
import { CapabilityRegistry } from "../capability-registry.js";
import { Skill } from "../skills/skill.js";
import { Tool } from "../tools/tool.js";
import { LLMCapabilityContext } from "./llm-capability.js";

const logger = createLogger("CapabilityResolver");
const MEMORY_TOOL_IDS = {
  remember: "tool.remember_fact",
  search: "tool.search_memory",
} as const;

@injectable()
export class CapabilityResolver {
  resolveToolsForAgent(config: AgentConfig, registry: CapabilityRegistry): Tool[] {
    const tools: Tool[] = [];
    const configuredTools = config.tools.filter((toolRef) => !isMemoryToolRef(toolRef));
    if (config.memory?.save) configuredTools.push(MEMORY_TOOL_IDS.remember);
    if (config.memory?.search) configuredTools.push(MEMORY_TOOL_IDS.search);

    for (const toolRef of configuredTools) {
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
      `Resolved ${tools.length}/${configuredTools.length} tool(s) for agent '${config.id}'`,
    );
    return tools;
  }

  resolveAllowedCapabilitiesForAgent(config: AgentConfig, registry: CapabilityRegistry): string[] {
    return [
      ...this.resolveToolsForAgent(config, registry).map((tool) => tool.id),
      ...this.resolveAgentsForAgent(config, registry).map((agent) => agent.id),
    ];
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

  formatToolsPrompt(tools: Tool[]): string {
    if (tools.length === 0) {
      return "";
    }

    const sections = tools.map((tool) => {
      let paramDoc = "";
      if (tool.inputSchema && typeof tool.inputSchema === "object") {
        const props = (tool.inputSchema.properties ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
        const reqs = Array.isArray(tool.inputSchema.required)
          ? (tool.inputSchema.required as string[])
          : [];
        const propEntries = Object.entries(props);
        if (propEntries.length > 0) {
          const formattedProps = propEntries
            .map(([key, prop]) => {
              const req = reqs.includes(key) ? "required" : "optional";
              const type = prop?.type ? String(prop.type) : "any";
              const desc = prop?.description ? `: ${prop.description}` : "";
              const enumVals = Array.isArray(prop?.enum) ? `, enum: [${prop.enum.join(", ")}]` : "";
              return `  - \`${key}\` (${type}, ${req}${enumVals})${desc}`;
            })
            .join("\n");
          paramDoc = `\nParameters:\n${formattedProps}`;
        }
      }
      return `### Tool: ${tool.name} (\`${tool.id}\`)\n${tool.description}${paramDoc}`;
    });

    return `\n\n## Available Tools\nYou have access to the following tools. Use these tools whenever needed to perform operations or retrieve live information rather than generating answers on your own:\n\n${sections.join(
      "\n\n---\n\n",
    )}`;
  }

  formatSubAgentsPrompt(agents: AgentCapability[]): string {
    if (agents.length === 0) {
      return "";
    }

    const sections = agents.map((agent) => {
      return `### Sub-Agent: ${agent.name} (\`${agent.id}\`)\n${agent.description.trim()}\nParameters:\n  - \`task\` (string, required): The task or question to delegate to this sub-agent.`;
    });

    return `\n\n## Available Sub-Agents\nYou have access to the following specialized sub-agents. Delegate tasks to them whenever their specialized capabilities or domain expertise are required rather than answering on your own:\n\n${sections.join(
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

function isMemoryToolRef(toolRef: string): boolean {
  return [
    MEMORY_TOOL_IDS.remember,
    MEMORY_TOOL_IDS.search,
    "remember_fact",
    "search_memory",
  ].includes(toolRef);
}
