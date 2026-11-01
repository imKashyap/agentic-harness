import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { TestTool } from "../../tests/support/test-tool.js";
import { CapabilityRegistry } from "./capability-registry.js";

describe("CapabilityRegistry", () => {
  it("registers and retrieves tools by full id and short name", () => {
    const registry = new CapabilityRegistry();
    const tool = new TestTool();

    registry.register(tool);

    assert.strictEqual(registry.has("tool.test"), true);
    assert.strictEqual(registry.has("test"), true);
    assert.strictEqual(registry.get("tool.test").id, "tool.test");
    assert.strictEqual(registry.get("test").id, "tool.test");
    assert.strictEqual(registry.getTool("tool.test").id, "tool.test");
    assert.strictEqual(registry.getTool("test").id, "tool.test");
  });

  it("throws when registering duplicate capability", () => {
    const registry = new CapabilityRegistry();
    const tool = new TestTool();

    registry.register(tool);
    assert.throws(() => registry.register(tool), /Capability already registered/);
  });

  it("throws when capability is not found", () => {
    const registry = new CapabilityRegistry();
    assert.throws(() => registry.get("nonexistent"), /Capability not found/);
  });

  it("throws when retrieving a capability with incorrect type method", () => {
    const registry = new CapabilityRegistry();
    const tool = new TestTool();
    registry.register(tool);

    assert.throws(() => registry.getSkill("tool.test"), /is not a skill/);
    assert.throws(() => registry.getAgent("tool.test"), /is not an agent/);
  });

  it("filters capabilities by type", () => {
    const registry = new CapabilityRegistry();
    const tool = new TestTool();
    registry.register(tool);

    const tools = registry.getByType("tool");
    const skills = registry.getByType("skill");

    assert.strictEqual(tools.length, 1);
    assert.strictEqual(skills.length, 0);
  });
});
