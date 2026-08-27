import { Hono } from "hono";

import { AgentHarness } from "../../core/harness.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("SessionRoutes");

export function createSessionRoutes(harness: AgentHarness): Hono {
  const router = new Hono();

  // List sessions
  router.get("/", async (c) => {
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
  router.get("/:id", async (c) => {
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
  router.delete("/:id", async (c) => {
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
