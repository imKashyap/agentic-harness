import assert from "node:assert";
import { describe, it } from "node:test";

import { AgentConfig } from "../core/agent/agent-config.js";
import { AgentHarness } from "../core/harness.js";
import { StaticPlanGenerator } from "../core/orchestration/static-plan-generator.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { createApp } from "./app.js";

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
  const harness = await AgentHarness.init({
    tools: [],
    planGenerator: new StaticPlanGenerator(),
    promptProvider: mockPromptProvider,
  });

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

describe("Hono HTTP / SSE Server API", () => {
  it("responds to GET /health with status 200", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/health");
    assert.strictEqual(res.status, 200);

    const data = (await res.json()) as { status: string };
    assert.strictEqual(data.status, "ok");
  });

  it("lists registered agents on GET /v1/agents", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/v1/agents");
    assert.strictEqual(res.status, 200);

    const data = (await res.json()) as { success: boolean; agents: Array<{ id: string }> };
    assert.strictEqual(data.success, true);
    assert.ok(data.agents.some((a) => a.id === "api-agent"));
  });

  it("lists registered capabilities on GET /v1/capabilities", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/v1/capabilities");
    assert.strictEqual(res.status, 200);

    const data = (await res.json()) as { success: boolean; capabilities: Array<{ id: string }> };
    assert.strictEqual(data.success, true);
    assert.ok(data.capabilities.length > 0);
  });

  it("executes an agent run in JSON mode on POST /v1/agents/:id/runs", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/v1/agents/api-agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Hello API",
        sessionId: "api-sess-1",
      }),
    });

    assert.strictEqual(res.status, 200);

    const data = (await res.json()) as {
      success: boolean;
      response: string;
      sessionId: string;
      messages: unknown[];
    };
    assert.strictEqual(data.success, true);
    assert.ok(data.response.includes("Hello API"));
    assert.strictEqual(data.sessionId, "api-sess-1");
    assert.ok(data.messages.length >= 3);
  });

  it("streams an agent run in SSE mode on POST /v1/agents/:id/runs with stream: true", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    const res = await app.request("/v1/agents/api-agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Stream this response",
        stream: true,
      }),
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/event-stream"));

    const text = await res.text();
    assert.ok(text.includes("event: run:start"));
    assert.ok(text.includes("event: token:delta"));
    assert.ok(text.includes("event: run:end"));
  });

  it("retrieves and deletes sessions via /v1/sessions/:id", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    // Create session by running agent
    await app.request("/v1/agents/api-agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Store my session",
        sessionId: "sess-crud-test",
      }),
    });

    // Retrieve session
    const getRes = await app.request("/v1/sessions/sess-crud-test");
    assert.strictEqual(getRes.status, 200);
    const getData = (await getRes.json()) as { success: boolean; session: { id: string } };
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.session.id, "sess-crud-test");

    // Delete session
    const delRes = await app.request("/v1/sessions/sess-crud-test", {
      method: "DELETE",
    });
    assert.strictEqual(delRes.status, 200);

    // Verify deleted
    const getAfterDel = await app.request("/v1/sessions/sess-crud-test");
    assert.strictEqual(getAfterDel.status, 404);
  });

  it("ingests and searches memory via /v1/memory and /v1/memory/search", async () => {
    const harness = await createTestHarness();
    const app = createApp(harness);

    // Ingest memory
    const storeRes = await app.request("/v1/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fact: "Server infrastructure deployed on Google Cloud Platform",
        agentId: "api-agent",
        tags: ["cloud", "gcp"],
      }),
    });

    assert.strictEqual(storeRes.status, 200);

    // Search memory
    const searchRes = await app.request("/v1/memory/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Google Cloud Platform infrastructure",
        agentId: "api-agent",
      }),
    });

    assert.strictEqual(searchRes.status, 200);
    const searchData = (await searchRes.json()) as {
      success: boolean;
      count: number;
      results: Array<{ content: string }>;
    };
    assert.strictEqual(searchData.success, true);
    assert.ok(searchData.count > 0);
    assert.ok(searchData.results[0]?.content.includes("Google Cloud Platform"));
  });
});
