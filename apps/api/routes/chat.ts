import { Hono } from "hono";

import { AgentHarness } from "../../../src/core/harness.js";
import { createLogger } from "../../../src/observability/logging.js";

const logger = createLogger("ChatRoutes");

export function createChatRoutes(harness: AgentHarness): Hono {
  const router = new Hono();

  // List sessions
  router.get("/sessions", async (c) => {
    const agentId = c.req.query("agentId");
    const sessions = await harness.listSessions(agentId);
    return c.json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s.id,
        agentId: s.agentId,
        messageCount: s.messages.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  });

  // Get session details
  router.get("/sessions/:id", async (c) => {
    const sessionId = c.req.param("id");
    const session = await harness.getSession(sessionId);

    if (!session) {
      return c.json(
        {
          success: false,
          error: `Session '${sessionId}' not found`,
        },
        404,
      );
    }

    return c.json({
      success: true,
      session,
    });
  });

  // Delete session
  router.delete("/sessions/:id", async (c) => {
    const sessionId = c.req.param("id");
    const deleted = await harness.deleteSession(sessionId);
    logger.info(`Session delete requested for '${sessionId}' (deleted: ${deleted})`);

    return c.json({
      success: true,
      deleted,
    });
  });

  return router;
}
