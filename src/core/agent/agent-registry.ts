import { injectable } from "inversify";

import { HarnessError } from "../../errors/harness-error.js";
import { AgentNotFoundError } from "../../errors/orchestration-errors.js";
import { createLogger } from "../../utils/logger.js";
import { Agent } from "./agent.js";

const logger = createLogger("AgentRegistry");

@injectable()
export class AgentRegistry {
  private readonly agents = new Map<string, Agent>();

  register(agentId: string, agent: Agent): void {
    if (this.agents.has(agentId)) {
      logger.error(`Attempted to register already registered agent: ${agentId}`);
      throw new HarnessError(
        `Agent already registered: ${agentId}`,
        "AGENT_ALREADY_REGISTERED",
        409,
        {
          agentId,
        },
      );
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
      throw new AgentNotFoundError(agentId);
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
