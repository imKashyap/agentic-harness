import "reflect-metadata";
import "dotenv/config";

import { AgentHarness } from "../../src/core/harness.js";
import { createLogger } from "../../src/observability/logging.js";

const logger = createLogger("Scenario:AgentDelegation");

async function main() {
  logger.info("Initializing AgentHarness for Agent Delegation scenario...");
  const harness = await AgentHarness.init();

  // Listen to subagent events
  harness.eventBus.on("subagent:delegated", (evt) => {
    logger.info(`[Event] Sub-agent delegated: ${evt.subAgentId} for task: "${evt.task}"`);
  });

  harness.eventBus.on("subagent:completed", (evt) => {
    logger.info(`[Event] Sub-agent completed: ${evt.subAgentId} in ${evt.durationMs}ms`);
  });

  const query =
    process.env.AGENT_INPUT ||
    "Please delegate research on modern agent architectures to the researcher agent and summarize the findings.";
  logger.info(`Executing agent 'default-agent' with input: "${query}"`);

  const result = await harness.runAgent("default-agent", {
    message: query,
  });

  logger.info(`Parent Agent Response:\n${result.response}`);
}

main().catch((err) => {
  logger.error(`Error in Agent Delegation scenario: ${String(err)}`);
  process.exit(1);
});
