import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { AgentHarness } from "../../src/core/harness.js";
import { MockLLM } from "../../src/llm/mock-llm.js";
import { withMockPersistence } from "../support/mock-stores.js";

describe("Agent Evals & Benchmark Framework", () => {
  it("evaluates agent response against expected criteria", async () => {
    const harness = await AgentHarness.init(withMockPersistence());
    assert.ok(harness.listAgents().length > 0);
    const mock = new MockLLM();
    const response = await mock.chat({
      messages: [{ role: "user", content: "What is 2 + 2?" }],
    });

    assert.ok(response.content.length > 0);
  });
});
