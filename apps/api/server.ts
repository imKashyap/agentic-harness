import "reflect-metadata";
import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { AgentHarness } from "../../src/core/harness.js";
import { HarnessError } from "../../src/errors/harness-error.js";
import { createLogger } from "../../src/observability/logging.js";
import type { PrincipalIdResolver } from "./principal.js";
import { createChatRoutes } from "./routes/chat.js";
import { createHealthRoutes } from "./routes/health.js";
import { createMemoryRoutes } from "./routes/memory.js";
import { createRunRoutes } from "./routes/runs.js";

const logger = createLogger("ApiServer");

export interface ApiOptions {
  /** Must read a verified identity established by the host application. */
  resolvePrincipalId?: PrincipalIdResolver;
}

export function createApp(harness: AgentHarness, options: ApiOptions = {}): Hono {
  const app = new Hono();

  // Enable CORS
  app.use("*", cors());

  // Request logger middleware
  app.use("*", async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    logger.debug(`--> ${method} ${path}`);
    await next();
    const duration = Date.now() - start;
    logger.debug(`<-- ${method} ${path} ${c.res.status} (${duration}ms)`);
  });

  // Mount API route groups
  app.route("/health", createHealthRoutes(harness));
  app.route("/v1", createChatRoutes(harness));
  app.route("/v1", createRunRoutes(harness, options.resolvePrincipalId));
  app.route("/v1", createMemoryRoutes(harness, options.resolvePrincipalId));

  // Global error handler
  app.onError((err, c) => {
    logger.error(`Unhandled server error: ${err.message}`);
    if (err instanceof HarnessError) {
      return c.json(
        {
          success: false,
          code: err.code,
          error: err.message,
          details: err.details,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err.statusCode as any) || 500,
      );
    }

    return c.json(
      {
        success: false,
        error: err.message || "Internal server error",
      },
      500,
    );
  });

  return app;
}

export async function startServer(port: number = 3000, options: ApiOptions = {}): Promise<void> {
  logger.info("Starting Agentic Harness API Server...");
  const harness = await AgentHarness.init();
  const app = createApp(harness, options);

  serve({ fetch: app.fetch, port }, (info) => {
    logger.info(`Agentic Harness API server listening on http://localhost:${info.port}`);
  });
}

// If invoked directly
const isDirectEntry =
  process.argv[1]?.endsWith("apps/api/server.ts") ||
  process.argv[1]?.endsWith("dist/apps/api/server.js");
if (isDirectEntry) {
  const port = parseInt(process.env["PORT"] || "3000", 10);
  startServer(port).catch((err) => {
    logger.error(`Fatal server error: ${String(err)}`);
    process.exit(1);
  });
}
