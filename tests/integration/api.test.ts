import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { createApp } from "../../apps/api/server.js";
import { AgentConfig } from "../../src/core/agent/agent-config.js";
import { AgentHarness } from "../../src/core/harness.js";
import { StaticPlanGenerator } from "../../src/core/orchestration/static-plan-generator.js";
import { PromptProvider } from "../../src/prompts/prompt-provider.js";
import { withMockPersistence } from "../support/mock-stores.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: "v1",
      content: "You are a test API server agent.",
    };
  },
};

async function createTestHarness(): Promise<AgentHarness> {
  const harness = await AgentHarness.init(
    withMockPersistence({
      tools: [],
      planGenerator: new StaticPlanGenerator(),
      promptProvider: mockPromptProvider,
    }),
  );

  const config: AgentConfig = {
    id: "api-agent",
    name: "API Agent",
    model: { provider: "mock", model: "mock-model" },
    prompt: { id: "api-prompt" },
    skills: [],
    tools: [],
    subAgents: [],
  };

  harness.registerAgent(config);
  return harness;
}

describe("Apps/API Hono Server", () => {
  it("GET /health returns 200 ok and uptime", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/health");
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as { status: string };
    assert.strictEqual(data.status, "ok");
  });

  it("POST /v1/agents/:id/runs executes agent run", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/v1/agents/api-agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Test query" }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as { success: boolean; response: string };
    assert.strictEqual(data.success, true);
    assert.ok(data.response.length > 0);
  });

  it("POST /v1/agents/:id/runs supports SSE streaming", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/v1/agents/api-agent/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ message: "Stream test" }),
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/event-stream"));

    const text = await res.text();
    assert.ok(text.includes("event: run:start"));
    assert.ok(text.includes("event: run:end"));
  });

  it("manages session CRUD over /v1/sessions", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    await app.request("/v1/agents/api-agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", sessionId: "sess-api-1" }),
    });

    const getRes = await app.request("/v1/sessions/sess-api-1");
    assert.strictEqual(getRes.status, 200);

    const delRes = await app.request("/v1/sessions/sess-api-1", { method: "DELETE" });
    assert.strictEqual(delRes.status, 200);
  });
});
