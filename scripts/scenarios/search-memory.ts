import "reflect-metadata";
import "dotenv/config";

import { AgentHarness } from "../../src/core/harness.js";
import { createLogger } from "../../src/observability/logging.js";

const logger = createLogger("Scenario:SearchMemory");

async function main() {
  logger.info("Initializing AgentHarness for Search Memory scenario...");
  const harness = await AgentHarness.init();

  // 1. Ingest test memories into long-term memory store
  logger.info("Ingesting sample facts into long-term memory...");
  await harness.remember(
    "The production database cluster was upgraded to PostgreSQL 16.2 on 2026-05-10.",
    {
      agentId: "default-agent",
      tags: ["database", "infrastructure", "production"],
    },
  );

  await harness.remember(
    "All microservice API keys must be rotated every 90 days following security standard ISO-27001.",
    {
      agentId: "default-agent",
      tags: ["security", "compliance", "auth"],
    },
  );

  // 2. Perform direct semantic recall
  const query = process.env.AGENT_INPUT || "What version of postgres are we running in production?";
  logger.info(`Searching memory for: "${query}"`);

  const recalled = await harness.recall(query, {
    agentId: "default-agent",
    limit: 3,
  });

  logger.info(`Found ${recalled.length} matching memory entries:`);
  for (const match of recalled) {
    logger.info(
      `  • [Score: ${match.score.toFixed(3)}] ${match.entry.content} (tags: ${match.entry.tags?.join(", ")})`,
    );
  }

  // 3. Run the agent with long-term memory recall enabled
  logger.info("Running agent with memory injection enabled...");
  const runResult = await harness.runAgent("default-agent", {
    message: query,
    enableLongTermMemory: true,
  });

  logger.info(`Agent Response with memory context:\n${runResult.response}`);
}

main().catch((err) => {
  logger.error(`Error in Search Memory scenario: ${String(err)}`);
  process.exit(1);
});
