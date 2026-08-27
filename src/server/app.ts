import { Hono } from "hono";
import { cors } from "hono/cors";

import { AgentHarness } from "../core/harness.js";
import { HarnessError } from "../errors/harness-error.js";
import { createLogger } from "../utils/logger.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createCapabilityRoutes } from "./routes/capabilities.js";
import { createRunRoutes } from "./routes/runs.js";
import { createSessionRoutes } from "./routes/sessions.js";

const logger = createLogger("HttpServer");

export function createApp(harness: AgentHarness): Hono {
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

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: Date.now(),
      uptime: process.uptime(),
    });
  });

  // Mount API route groups
  app.route("/v1/agents", createAgentRoutes(harness));
  app.route("/v1/sessions", createSessionRoutes(harness));
  app.route("/v1/capabilities", createCapabilityRoutes(harness));
  app.route("/v1", createCapabilityRoutes(harness)); // support /v1/memory directly
  app.route("/v1", createRunRoutes(harness)); // support /v1/approvals and /v1/runs/:id/approve

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
