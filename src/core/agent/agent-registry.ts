import { Agent } from "./agent.js";

export class AgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agentId: string, agent: Agent): void {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent already registered: ${agentId}`);
    }

    this.agents.set(agentId, agent);
  }

  get(agentId: string): Agent {
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return agent;
  }

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  getAll(): Agent[] {
    return [...this.agents.values()];
  }
}
