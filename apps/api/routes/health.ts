import { Hono } from "hono";

import { AgentHarness } from "../../../src/core/harness.js";
import { MetricsService } from "../../../src/observability/metrics.js";

export function createHealthRoutes(harness: AgentHarness): Hono {
  const router = new Hono();

  router.get("/", (c) => {
    let metricsSummary = undefined;
    try {
      if (harness.container) {
        const metrics = harness.container.get<MetricsService>(Symbol.for("MetricsService"));
        metricsSummary = metrics.getSummary();
      }
    } catch {
      // ignore
    }

    return c.json({
      status: "ok",
      timestamp: Date.now(),
      uptime: process.uptime(),
      metrics: metricsSummary,
    });
  });

  return router;
}
