import assert from "node:assert";
import { describe, it } from "node:test";

import { CapabilityRegistry } from "./capability-registry.js";
import { CalculatorTool } from "./tools/examples/calculator-tool.js";

describe("CapabilityRegistry", () => {
  it("registers and retrieves tools by full id and short name", () => {
    const registry = new CapabilityRegistry();
    const tool = new CalculatorTool();

    registry.register(tool);

    assert.strictEqual(registry.has("tool.calculator"), true);
    assert.strictEqual(registry.has("calculator"), true);
    assert.strictEqual(registry.get("tool.calculator").id, "tool.calculator");
    assert.strictEqual(registry.get("calculator").id, "tool.calculator");
    assert.strictEqual(registry.getTool("tool.calculator").id, "tool.calculator");
    assert.strictEqual(registry.getTool("calculator").id, "tool.calculator");
  });

  it("throws when registering duplicate capability", () => {
    const registry = new CapabilityRegistry();
    const tool = new CalculatorTool();

    registry.register(tool);
    assert.throws(() => registry.register(tool), /Capability already registered/);
  });

  it("throws when capability is not found", () => {
    const registry = new CapabilityRegistry();
    assert.throws(() => registry.get("nonexistent"), /Capability not found/);
  });

  it("throws when retrieving a capability with incorrect type method", () => {
    const registry = new CapabilityRegistry();
    const tool = new CalculatorTool();
    registry.register(tool);

    assert.throws(() => registry.getSkill("tool.calculator"), /is not a skill/);
    assert.throws(() => registry.getAgent("tool.calculator"), /is not an agent/);
  });

  it("filters capabilities by type", () => {
    const registry = new CapabilityRegistry();
    const tool = new CalculatorTool();
    registry.register(tool);

    const tools = registry.getByType("tool");
    const skills = registry.getByType("skill");

    assert.strictEqual(tools.length, 1);
    assert.strictEqual(skills.length, 0);
  });
});
