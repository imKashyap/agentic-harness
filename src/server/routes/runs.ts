import { Hono } from "hono";

import { AgentHarness } from "../../core/harness.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("RunRoutes");

export function createRunRoutes(harness: AgentHarness): Hono {
  const router = new Hono();

  // List all pending approvals
  router.get("/approvals", async (c) => {
    const pending = await harness.listPendingApprovals();
    return c.json({
      success: true,
      pending,
    });
  });

  // Get specific checkpoint
  router.get("/checkpoints/:id", async (c) => {
    const id = c.req.param("id");
    const checkpoint = await harness.getCheckpoint(id);

    if (!checkpoint) {
      return c.json({ success: false, error: `Checkpoint '${id}' not found` }, 404);
    }

    return c.json({ success: true, checkpoint });
  });

  // Approve a run / checkpoint
  router.post("/runs/:id/approve", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };

    logger.info(`Approval received for run/checkpoint '${id}'`);
    const result = await harness.approveRun(id, body.reason);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: `No active pending approval found for '${id}'`,
        },
        404,
      );
    }

    return c.json({
      success: true,
      checkpoint: result.checkpoint,
    });
  });

  // Reject a run / checkpoint
  router.post("/runs/:id/reject", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };

    logger.info(`Rejection received for run/checkpoint '${id}'`);
    const result = await harness.rejectRun(id, body.reason);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: `No active pending approval found for '${id}'`,
        },
        404,
      );
    }

    return c.json({
      success: true,
      checkpoint: result.checkpoint,
    });
  });

  return router;
}
