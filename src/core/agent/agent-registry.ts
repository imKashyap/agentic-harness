import { createLogger } from "../../utils/logger.js";
import { Agent } from "./agent.js";

const logger = createLogger("AgentRegistry");

export class AgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agentId: string, agent: Agent): void {
    if (this.agents.has(agentId)) {
      logger.error(`Attempted to register already registered agent: ${agentId}`);
      throw new Error(`Agent already registered: ${agentId}`);
    }

    this.agents.set(agentId, agent);
    logger.info(`Registered agent: ${agentId}`);
  }

  get(agentId: string): Agent {
    let agent = this.agents.get(agentId);

    if (!agent && agentId.startsWith("agent.")) {
      const strippedId = agentId.slice(6);
      agent = this.agents.get(strippedId);
    } else if (!agent) {
      agent = this.agents.get(`agent.${agentId}`);
    }

    if (!agent) {
      logger.error(`Agent not found in registry: ${agentId}`);
      throw new Error(`Agent not found: ${agentId}`);
    }

    return agent;
  }

  has(agentId: string): boolean {
    if (this.agents.has(agentId)) {
      return true;
    }
    if (agentId.startsWith("agent.")) {
      return this.agents.has(agentId.slice(6));
    }
    return this.agents.has(`agent.${agentId}`);
  }

  getAll(): Agent[] {
    return [...this.agents.values()];
  }
}
