import { AgentConfig } from "../core/agent/agent-config.js";
import { createLogger } from "../utils/logger.js";
import { AgentCapabilityLoader } from "./agents/agent-capability-loader.js";
import { Capability } from "./capability.js";
import { SkillCapabilityLoader } from "./skills/skill-capability-loader.js";
import { Tool } from "./tools/tool.js";
import { ToolCapabilityLoader } from "./tools/tool-capability-loader.js";

const logger = createLogger("CapabilityLoader");

export interface CapabilityLoaderInterface<T extends Capability = Capability> {
  loadAll(): Promise<T[]>;
}

export interface CapabilityLoaderOptions {
  agentsDir?: string;
  toolsDir?: string;
  skillsDir?: string;
  inMemoryTools?: Tool[];
}

/**
 * Agent-driven capability loader:
 * Starts with agents in `agentsDir`, discovers their declared tools and skills,
 * loads them using dedicated capability loaders with shared caching,
 * and outputs all resolved capabilities for registry storage.
 */
export class CapabilityLoader implements CapabilityLoaderInterface {
  private readonly agentLoader: AgentCapabilityLoader;
  private readonly toolLoader: ToolCapabilityLoader;
  private readonly skillLoader: SkillCapabilityLoader;
  private readonly inMemoryTools: Tool[];
  private discoveredConfigs: AgentConfig[] = [];

  constructor(options: CapabilityLoaderOptions = {}) {
    const agentsDir = options.agentsDir ?? "./agents";
    const toolsDir = options.toolsDir ?? "./tools";
    const skillsDir = options.skillsDir ?? "./skills";
    this.inMemoryTools = options.inMemoryTools ?? [];

    this.agentLoader = new AgentCapabilityLoader(agentsDir);
    this.toolLoader = new ToolCapabilityLoader(toolsDir, this.inMemoryTools);
    this.skillLoader = new SkillCapabilityLoader(skillsDir);
  }

  getDiscoveredAgentConfigs(): AgentConfig[] {
    return this.discoveredConfigs;
  }

  getToolLoader(): ToolCapabilityLoader {
    return this.toolLoader;
  }

  getSkillLoader(): SkillCapabilityLoader {
    return this.skillLoader;
  }

  getAgentLoader(): AgentCapabilityLoader {
    return this.agentLoader;
  }

  async loadAll(): Promise<Capability[]> {
    logger.info("Starting agent-driven capability discovery...");

    // 1. Scan and discover all agents first
    const agentConfigs = await this.agentLoader.loadAgentConfigs();
    this.discoveredConfigs = agentConfigs;
    const agentCapabilities = await this.agentLoader.loadAll();

    const capabilities: Capability[] = [...agentCapabilities];
    const loadedCapabilityIds = new Set<string>(capabilities.map((c) => c.id));

    // 2. For each discovered agent, scan its declared tools and skills
    for (const agentConfig of agentConfigs) {
      logger.debug(
        `Resolving capabilities for agent '${agentConfig.id}' (tools: ${agentConfig.tools.length}, skills: ${agentConfig.skills.length})`,
      );

      // Load tools declared by the agent
      for (const toolRef of agentConfig.tools) {
        // Skip memory tools if they will be registered via inMemoryTools
        const tool = await this.toolLoader.load(toolRef);
        if (tool && !loadedCapabilityIds.has(tool.id)) {
          capabilities.push(tool);
          loadedCapabilityIds.add(tool.id);
          logger.debug(`Registered tool '${tool.id}' from agent '${agentConfig.id}'`);
        }
      }

      // Load skills declared by the agent
      for (const skillRef of agentConfig.skills) {
        const skill = await this.skillLoader.load(skillRef);
        if (skill && !loadedCapabilityIds.has(skill.id)) {
          capabilities.push(skill);
          loadedCapabilityIds.add(skill.id);
          logger.debug(`Registered skill '${skill.id}' from agent '${agentConfig.id}'`);
        }
      }
    }

    // 3. Ensure any in-memory tools (e.g. remember_fact, search_memory) are also registered
    for (const inMemTool of this.inMemoryTools) {
      if (!loadedCapabilityIds.has(inMemTool.id)) {
        capabilities.push(inMemTool);
        loadedCapabilityIds.add(inMemTool.id);
        logger.debug(`Registered in-memory tool '${inMemTool.id}'`);
      }
    }

    logger.info(
      `Agent-driven discovery complete: ${capabilities.length} total capability(ies) resolved across ${agentConfigs.length} agent(s)`,
    );

    return capabilities;
  }
}
