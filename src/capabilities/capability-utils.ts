import { CapabilityType } from "./capability.js";

export interface ParsedCapabilityId {
  type: CapabilityType;
  name: string;
  fullId: string;
}

export function parseCapabilityId(id: string): ParsedCapabilityId {
  if (id.startsWith("tool.")) {
    return {
      type: "tool",
      name: id.slice(5),
      fullId: id,
    };
  }

  if (id.startsWith("agent.")) {
    return {
      type: "agent",
      name: id.slice(6),
      fullId: id,
    };
  }

  if (id.startsWith("skill.")) {
    return {
      type: "skill",
      name: id.slice(6),
      fullId: id,
    };
  }

  return {
    type: "tool",
    name: id,
    fullId: id,
  };
}

export function normalizeCapabilityId(type: CapabilityType, idOrName: string): string {
  const prefix = `${type}.`;
  if (idOrName.startsWith(prefix)) {
    return idOrName;
  }
  return `${prefix}${idOrName}`;
}
