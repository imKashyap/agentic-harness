import "reflect-metadata";

import assert from "node:assert";
import { describe, it } from "node:test";

import { MockSessionStore, withMockPersistence } from "../../tests/support/mock-stores.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { AgentRegistry } from "../core/agent/agent-registry.js";
import { AgentHarness } from "../core/harness.js";
import { Orchestrator } from "../core/orchestration/orchestrator.js";
import { HarnessEventBus } from "../events/event-bus.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { createHarnessContainer } from "./container.js";
import { TYPES } from "./types.js";

const mockPromptProvider: PromptProvider = {
  async getPrompt(req) {
    return {
      id: req.id,
      version: "v1",
      content: "You are a test DI agent.",
    };
  },
};

describe("Inversify DI Container & Singleton Scoping", () => {
  it("resolves core services as singletons from the IoC container", () => {
    const container = createHarnessContainer({
      promptProvider: mockPromptProvider,
    });

    const registry1 = container.get<CapabilityRegistry>(TYPES.CapabilityRegistry);
    const registry2 = container.get<CapabilityRegistry>(TYPES.CapabilityRegistry);
    assert.strictEqual(registry1, registry2);

    const agentRegistry1 = container.get<AgentRegistry>(TYPES.AgentRegistry);
    const agentRegistry2 = container.get<AgentRegistry>(TYPES.AgentRegistry);
    assert.strictEqual(agentRegistry1, agentRegistry2);

    const eventBus1 = container.get<HarnessEventBus>(TYPES.EventBus);
    const eventBus2 = container.get<HarnessEventBus>(TYPES.EventBus);
    assert.strictEqual(eventBus1, eventBus2);

    const orchestrator1 = container.get<Orchestrator>(TYPES.Orchestrator);
    const orchestrator2 = container.get<Orchestrator>(TYPES.Orchestrator);
    assert.strictEqual(orchestrator1, orchestrator2);
  });

  it("injects custom service instances into the container", () => {
    const customEventBus = new HarnessEventBus();
    const customSessionStore = new MockSessionStore();

    const container = createHarnessContainer(
      withMockPersistence({
        eventBus: customEventBus,
        sessionStore: customSessionStore,
        promptProvider: mockPromptProvider,
      }),
    );

    const resolvedBus = container.get<HarnessEventBus>(TYPES.EventBus);
    assert.strictEqual(resolvedBus, customEventBus);

    const resolvedSessionStore = container.get<MockSessionStore>(TYPES.SessionStore);
    assert.strictEqual(resolvedSessionStore, customSessionStore);
  });

  it("initializes AgentHarness via Inversify container and exposes container property", async () => {
    const harness = await AgentHarness.init(
      withMockPersistence({
        promptProvider: mockPromptProvider,
      }),
    );

    assert.ok(harness.container);
    assert.strictEqual(
      harness.capabilityRegistry,
      harness.container.get<CapabilityRegistry>(TYPES.CapabilityRegistry),
    );
    assert.strictEqual(
      harness.agentRegistry,
      harness.container.get<AgentRegistry>(TYPES.AgentRegistry),
    );
    assert.strictEqual(harness.eventBus, harness.container.get<HarnessEventBus>(TYPES.EventBus));
  });
});
