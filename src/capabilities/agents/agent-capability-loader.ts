import { CapabilityLoader } from "../capability-loader.js";
import { AgentCapability } from "./agent-capability.js";

export class AgentCapabilityLoader implements CapabilityLoader {
  async loadAll(): Promise<AgentCapability[]> {
    return [];
  }
}
