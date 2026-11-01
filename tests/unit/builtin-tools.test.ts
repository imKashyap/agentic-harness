import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import {
  createBuiltinTools,
  RememberFactTool,
  SearchMemoryTool,
  Tool,
} from "../../src/capabilities/tools/index.js";
import { AgentHarness } from "../../src/core/harness.js";
import { createHarnessContainer } from "../../src/di/container.js";
import { TYPES } from "../../src/di/types.js";
import { MemoryManager } from "../../src/memory/long-term/memory-manager.js";
import { MockLongTermMemoryStore, withMockPersistence } from "../support/mock-stores.js";

describe("Built-in Tools Architecture", () => {
  it("exports RememberFactTool and SearchMemoryTool directly from capabilities/tools", () => {
    const store = new MockLongTermMemoryStore();
    const memoryManager = new MemoryManager(store);

    const rememberTool = new RememberFactTool(memoryManager);
    const searchTool = new SearchMemoryTool(memoryManager);

    assert.strictEqual(rememberTool.id, "tool.remember_fact");
    assert.strictEqual(rememberTool.type, "tool");
    assert.strictEqual(rememberTool.progressMessage, "Saving insight to long-term memory...");

    assert.strictEqual(searchTool.id, "tool.search_memory");
    assert.strictEqual(searchTool.type, "tool");
    assert.strictEqual(searchTool.progressMessage, "Searching long-term memory...");
  });

  it("createBuiltinTools returns both memory tools bound to the given manager", () => {
    const store = new MockLongTermMemoryStore();
    const memoryManager = new MemoryManager(store);
    const builtinTools = createBuiltinTools(memoryManager);

    assert.strictEqual(builtinTools.length, 2);
    assert.deepStrictEqual(
      builtinTools.map((t) => t.id),
      ["tool.remember_fact", "tool.search_memory"],
    );
  });

  it("resolves BuiltinTools via the DI container", () => {
    const container = createHarnessContainer({
      longTermMemoryStore: new MockLongTermMemoryStore(),
    });

    assert.strictEqual(container.isBound(TYPES.BuiltinTools), true);
    const builtinTools = container.get<Tool[]>(TYPES.BuiltinTools);
    assert.strictEqual(builtinTools.length, 2);
    assert.strictEqual(builtinTools[0]?.id, "tool.remember_fact");
    assert.strictEqual(builtinTools[1]?.id, "tool.search_memory");
  });

  it("auto-registers built-in tools in AgentHarness without requiring caller instantiation", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        longTermMemoryStore: new MockLongTermMemoryStore(),
      }),
    );

    assert.strictEqual(harness.capabilityRegistry.has("tool.remember_fact"), true);
    assert.strictEqual(harness.capabilityRegistry.has("tool.search_memory"), true);
    assert.strictEqual(harness.capabilityRegistry.has("tool.calculator"), false);

    const supervisor = harness.getAgent("supervisor");
    assert.ok(!supervisor.tools.includes("tool.remember_fact"));
    assert.ok(!supervisor.tools.includes("tool.search_memory"));
  });
});
