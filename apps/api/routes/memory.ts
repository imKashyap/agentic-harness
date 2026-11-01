import { Hono } from "hono";

import { AgentHarness } from "../../../src/core/harness.js";
import { createLogger } from "../../../src/observability/logging.js";
import { type PrincipalIdResolver, resolvePrincipalId } from "../principal.js";

const logger = createLogger("MemoryRoutes");

export function createMemoryRoutes(
  harness: AgentHarness,
  principalIdResolver?: PrincipalIdResolver,
): Hono {
  const router = new Hono();

  // List all capabilities
  router.get("/capabilities", (c) => {
    const capabilities = harness.listCapabilities();
    return c.json({
      success: true,
      capabilities: capabilities.map((cap) => ({
        id: cap.id,
        name: cap.name,
        type: cap.type,
        description: cap.description,
      })),
    });
  });

  // Store fact into long-term memory
  router.post("/memory", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      fact?: string;
      tags?: string[];
    };

    if (!body.fact || typeof body.fact !== "string" || body.fact.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: "Request body must contain a non-empty 'fact' string",
        },
        400,
      );
    }

    const principalId = await resolvePrincipalId(c.req.raw, principalIdResolver);
    if (!principalId) {
      return c.json({ success: false, error: "Authentication is required for user memory" }, 401);
    }

    try {
      const memory = await harness.remember(body.fact.trim(), {
        principalId,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
      });

      logger.info(`Stored memory [${memory.id}] via API`);
      return c.json({
        success: true,
        memory: {
          id: memory.id,
          content: memory.content,
          createdByAgentId: memory.agentId,
          tags: memory.tags,
          createdAt: memory.createdAt,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Search long-term memory
  router.post("/memory/search", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      query?: string;
      limit?: number;
    };

    if (!body.query || typeof body.query !== "string" || body.query.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: "Request body must contain a non-empty 'query' string",
        },
        400,
      );
    }

    const principalId = await resolvePrincipalId(c.req.raw, principalIdResolver);
    if (!principalId) {
      return c.json({ success: false, error: "Authentication is required for user memory" }, 401);
    }

    try {
      const results = await harness.recall(body.query.trim(), {
        principalId,
        limit: body.limit,
      });

      return c.json({
        success: true,
        query: body.query,
        count: results.length,
        results: results.map((r) => ({
          content: r.entry.content,
          score: Math.round(r.score * 100) / 100,
          createdByAgentId: r.entry.agentId,
          tags: r.entry.tags,
          createdAt: r.entry.createdAt,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  return router;
}
