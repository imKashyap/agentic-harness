import "reflect-metadata";
import "dotenv/config";

import { AgentHarness } from "./core/harness.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("Main");

try {
  logger.info("Initializing Agentic Harness application...");

  const harness = await AgentHarness.init();

  const agentId = process.env.AGENT_ID ?? "default-agent";
  const input = process.env.AGENT_INPUT ?? "Hello";

  logger.info(`Running agent '${agentId}' with input: "${input}"`);

  const result = await harness.runAgent(agentId, input);

  logger.info("Execution completed successfully");
  console.log(result.response);
} catch (error) {
  logger.error(
    `Application fatal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
}
