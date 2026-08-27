import "reflect-metadata";

import { AgentHarness } from "../core/harness.js";
import { createLogger } from "../utils/logger.js";
import { startServer } from "./server.js";

const logger = createLogger("ServerEntry");

async function main(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const harness = await AgentHarness.init();

  const instance = await startServer({
    port,
    harness,
  });

  logger.info(`Server ready at http://localhost:${instance.port}`);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    await instance.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error(`Fatal server startup error: ${String(err)}`);
  process.exit(1);
});
