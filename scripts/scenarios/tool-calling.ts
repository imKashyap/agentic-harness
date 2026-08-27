import "reflect-metadata";
import "dotenv/config";

import { AgentHarness } from "../../src/core/harness.js";
import { createLogger } from "../../src/observability/logging.js";

const logger = createLogger("Scenario:ToolCalling");

async function main() {
  logger.info("Initializing AgentHarness for Tool Calling scenario...");
  const harness = await AgentHarness.init();

  // Listen to tool execution events
  harness.eventBus.on("tool:call", (evt) => {
    logger.info(`[Event] Tool called: ${JSON.stringify(evt.toolCalls)}`);
  });

  harness.eventBus.on("task:start", (evt) => {
    logger.info(
      `[Event] Task started: ${evt.taskId} (${evt.capability}) with input: ${JSON.stringify(evt.input)}`,
    );
  });

  harness.eventBus.on("task:complete", (evt) => {
    logger.info(`[Event] Task completed: ${evt.taskId} (${evt.capability}) in ${evt.durationMs}ms`);
  });

  const query = process.env.AGENT_INPUT || "Calculate (128 * 45) + 360 using the calculator tool.";
  logger.info(`Executing agent 'default-agent' with input: "${query}"`);

  const result = await harness.runAgent("default-agent", {
    message: query,
  });

  logger.info(`Agent Response:\n${result.response}`);
  logger.info(`Total messages in run: ${result.messages.length}`);
}

main().catch((err) => {
  logger.error(`Error in Tool Calling scenario: ${String(err)}`);
  process.exit(1);
});
