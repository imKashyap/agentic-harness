import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { AgentRunInput } from "../../../src/core/agent/agent-runner.js";
import { AgentHarness } from "../../../src/core/harness.js";
import { createLogger } from "../../../src/observability/logging.js";

const logger = createLogger("RunRoutes");

export function createRunRoutes(harness: AgentHarness): Hono {
  const router = new Hono();

  // List all registered agents
  router.get("/agents", (c) => {
    const agents = harness.listAgents();
    return c.json({
      success: true,
      agents,
    });
  });

  // Run an agent (JSON or Server-Sent Events stream)
  router.post("/agents/:id/runs", async (c) => {
    const agentId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      message?: string;
      sessionId?: string;
      stream?: boolean;
      enableLongTermMemory?: boolean;
    };

    if (!body.message || typeof body.message !== "string" || body.message.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: "Request body must contain a non-empty 'message' string",
        },
        400,
      );
    }

    const isSSE =
      body.stream === true || c.req.header("accept")?.includes("text/event-stream") === true;

    const runInput: AgentRunInput = {
      message: body.message.trim(),
      sessionId: body.sessionId,
      enableLongTermMemory: body.enableLongTermMemory,
    };

    if (isSSE) {
      logger.info(`Handling SSE stream request for agent '${agentId}'`);
      return streamSSE(c, async (stream) => {
        try {
          for await (const event of harness.runAgentStream(agentId, runInput, {
            sessionId: body.sessionId,
            enableLongTermMemory: body.enableLongTermMemory,
          })) {
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event.payload),
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`SSE stream error for agent '${agentId}': ${errorMessage}`);
          await stream.writeSSE({
            event: "run:error",
            data: JSON.stringify({ error: errorMessage }),
          });
        }
      });
    }

    try {
      logger.info(`Handling synchronous run request for agent '${agentId}'`);
      const result = await harness.runAgent(agentId, runInput, {
        sessionId: body.sessionId,
        enableLongTermMemory: body.enableLongTermMemory,
      });

      return c.json({
        success: true,
        response: result.response,
        sessionId: result.sessionId,
        messages: result.messages,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error running agent '${agentId}': ${errorMessage}`);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500,
      );
    }
  });

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
