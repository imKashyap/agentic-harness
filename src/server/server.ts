import { serve, ServerType } from "@hono/node-server";

import { AgentHarness } from "../core/harness.js";
import { createLogger } from "../utils/logger.js";
import { createApp } from "./app.js";

const logger = createLogger("Server");

export interface ServerOptions {
  port?: number;
  harness?: AgentHarness;
}

export interface RunningServer {
  server: ServerType;
  port: number;
  close: () => Promise<void>;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const port = options.port ?? Number(process.env.PORT || 3000);
  const harness = options.harness ?? (await AgentHarness.init());

  const app = createApp(harness);

  logger.info(`Starting Agentic Harness HTTP Server on port ${port}...`);

  return new Promise((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
      },
      (info) => {
        logger.info(`Agentic Harness Server is running on http://localhost:${info.port}`);
        resolve({
          server,
          port: info.port,
          close: async () => {
            return new Promise<void>((closeResolve) => {
              server.close(() => {
                logger.info("Agentic Harness Server stopped");
                closeResolve();
              });
            });
          },
        });
      },
    );
  });
}
