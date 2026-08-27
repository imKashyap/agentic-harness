import "reflect-metadata";
import "dotenv/config";

import { AgentHarness } from "../../src/core/harness.js";
import { createLogger } from "../../src/observability/logging.js";

const logger = createLogger("Scenario:DefaultAgent");

async function main() {
  logger.info("Initializing AgentHarness for Default Agent scenario...");
  const harness = await AgentHarness.init();

  const query = process.env.AGENT_INPUT || "Hello! Who are you and what capabilities do you have?";
  logger.info(`Executing agent 'default-agent' with message: "${query}"`);

  const result = await harness.runAgent("default-agent", {
    message: query,
  });

  logger.info(`Agent Response:\n${result.response}`);
}

main().catch((err) => {
  logger.error(`Error in Default Agent scenario: ${String(err)}`);
  process.exit(1);
});
