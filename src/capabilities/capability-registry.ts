import { createLogger } from "../utils/logger.js";
import { AgentCapability } from "./agents/agent-capability.js";
import { Capability } from "./capability.js";
import { Skill } from "./skills/skill.js";
import { Tool } from "./tools/tool.js";

const logger = createLogger("CapabilityRegistry");

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    if (this.capabilities.has(capability.id)) {
      logger.error(`Capability already registered: ${capability.id}`);
      throw new Error(`Capability already registered: ${capability.id}`);
    }

    this.capabilities.set(capability.id, capability);
    logger.info(
      `Registered capability '${capability.id}' (type: ${capability.type}, name: ${capability.name})`,
    );
  }

  get(id: string): Capability {
    const capability =
      this.capabilities.get(id) ??
      this.capabilities.get(`tool.${id}`) ??
      this.capabilities.get(`agent.${id}`) ??
      this.capabilities.get(`skill.${id}`);

    if (!capability) {
      logger.error(`Capability not found in registry: ${id}`);
      throw new Error(`Capability not found: ${id}`);
    }

    return capability;
  }

  getSkill(id: string): Skill {
    const capability = this.get(id);

    if (capability.type !== "skill") {
      logger.error(`Capability '${id}' is not a skill (actual: ${capability.type})`);
      throw new Error(`Capability ${id} is not a skill`);
    }

    return capability as Skill;
  }

  getTool(id: string): Tool {
    const capability = this.get(id);

    if (capability.type !== "tool") {
      logger.error(`Capability '${id}' is not a tool (actual: ${capability.type})`);
      throw new Error(`Capability ${id} is not a tool`);
    }

    return capability as Tool;
  }

  getAgent(id: string): AgentCapability {
    const capability = this.get(id);

    if (capability.type !== "agent") {
      logger.error(`Capability '${id}' is not an agent (actual: ${capability.type})`);
      throw new Error(`Capability ${id} is not an agent`);
    }

    return capability as AgentCapability;
  }

  has(id: string): boolean {
    return (
      this.capabilities.has(id) ||
      this.capabilities.has(`tool.${id}`) ||
      this.capabilities.has(`agent.${id}`) ||
      this.capabilities.has(`skill.${id}`)
    );
  }

  getByType(type: Capability["type"]): Capability[] {
    return [...this.capabilities.values()].filter((capability) => capability.type === type);
  }

  getAll(): Capability[] {
    return [...this.capabilities.values()];
  }
}
