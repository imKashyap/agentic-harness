import { Capability } from "./capability.js";
import { Skill } from "./skills/skill.js";
import { Tool } from "./tools/tool.js";
import { AgentCapability } from "./agents/agent-capability.js";

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    if (this.capabilities.has(capability.id)) {
      throw new Error(`Capability already registered: ${capability.id}`);
    }

    this.capabilities.set(capability.id, capability);
  }

  get(id: string): Capability {
    const capability = this.capabilities.get(id);

    if (!capability) {
      throw new Error(`Capability not found: ${id}`);
    }

    return capability;
  }

  getSkill(id: string): Skill {
    const capability = this.get(id);

    if (capability.type !== "skill") {
      throw new Error(`Capability ${id} is not a skill`);
    }

    return capability as Skill;
  }

  getTool(id: string): Tool {
    const capability = this.get(id);

    if (capability.type !== "tool") {
      throw new Error(`Capability ${id} is not a tool`);
    }

    return capability as Tool;
  }

  getAgent(id: string): AgentCapability {
    const capability = this.get(id);

    if (capability.type !== "agent") {
      throw new Error(`Capability ${id} is not an agent`);
    }

    return capability as AgentCapability;
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  getByType(type: Capability["type"]): Capability[] {
    return [...this.capabilities.values()].filter((capability) => capability.type === type);
  }

  getAll(): Capability[] {
    return [...this.capabilities.values()];
  }
}
