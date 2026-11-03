import "reflect-metadata";

import { Container } from "inversify";

import { SubAgentExecutor } from "../capabilities/agents/sub-agent-executor.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { CapabilityDispatcher } from "../capabilities/dispatch/capability-dispatcher.js";
import { CapabilityResolver } from "../capabilities/resolution/capability-resolver.js";
import { createBuiltinTools, Tool } from "../capabilities/tools/index.js";
import { ToolCapabilityExecutor } from "../capabilities/tools/tool-capability-executor.js";
import { ToolExecutor } from "../capabilities/tools/tool-executor.js";
import { ContextManager } from "../context/context-manager.js";
import { MemoryManager } from "../context/memory.js";
import { PromptBuilder } from "../context/prompt-builder.js";
import { TokenManager } from "../context/token-manager.js";
import { AgentConfigLoader } from "../core/agent/agent-config-loader.js";
import { AgentFactory } from "../core/agent/agent-factory.js";
import { AgentRegistry } from "../core/agent/agent-registry.js";
import { HarnessOptions } from "../core/harness.js";
import { ExecutionEngine } from "../core/orchestration/execution-engine.js";
import { Orchestrator } from "../core/orchestration/orchestrator.js";
import { PlanValidator } from "../core/orchestration/plan-validator.js";
import { Planner } from "../core/orchestration/planner.js";
import { Scheduler } from "../core/orchestration/scheduler.js";
import { StaticPlanGenerator } from "../core/orchestration/static-plan-generator.js";
import { InputGuard } from "../guardrails/input-guard.js";
import { OutputGuard } from "../guardrails/output-guard.js";
import { PolicyEngine } from "../guardrails/policy-engine.js";
import { ToolGuard } from "../guardrails/tool-guard.js";
import { ApprovalManager } from "../hitl/approval-manager.js";
import { RedisMessageBus } from "../infrastructure/messaging/message-bus.js";
import {
  PostgresCheckpointStore,
  PostgresLongTermMemoryStore,
  PostgresSessionStore,
  PostgresStateStore,
} from "../infrastructure/postgres/postgres-persistence.js";
import { PostgresStore } from "../infrastructure/postgres/postgres-store.js";
import { RedisStore } from "../infrastructure/redis/redis-store.js";
import { AgentModelConfigRegistry } from "../llm/configuration/agent-config-registry.js";
import { ConfigCache } from "../llm/configuration/config-cache.js";
import { InferenceProfileRegistry } from "../llm/configuration/inference-profile-registry.js";
import { ModelConfigResolver } from "../llm/configuration/model-config-resolver.js";
import { ModelRegistry } from "../llm/configuration/model-registry.js";
import { PostgresConfigStore } from "../llm/configuration/postgres-config-store.js";
import { ProviderRegistry } from "../llm/configuration/provider-registry.js";
import { ModelCatalog } from "../llm/model-catalog.js";
import { ModelRouter } from "../llm/model-router.js";
import { ContextCompactor } from "../memory/session/context-compactor.js";
import { HarnessEventBus } from "../observability/events.js";
import { MetricsService } from "../observability/metrics.js";
import { TracingService } from "../observability/tracing.js";
import { FilePromptProvider } from "../prompts/file-prompt-provider.js";
import { TYPES } from "./types.js";

export function createHarnessContainer(options: HarnessOptions = {}): Container {
  const container = new Container({ defaultScope: "Singleton" });
  const modelCatalog = new ModelCatalog(options.modelsConfigPath ?? "./config/models.yaml");
  container.bind(TYPES.ModelCatalog).toConstantValue(modelCatalog);
  container.bind(ModelCatalog).toConstantValue(modelCatalog);

  // Dynamic Configuration Registries & Resolvers
  container.bind(TYPES.ProviderRegistry).toConstantValue(modelCatalog.providerRegistry);
  container.bind(ProviderRegistry).toConstantValue(modelCatalog.providerRegistry);

  container.bind(TYPES.ModelRegistry).toConstantValue(modelCatalog.modelRegistry);
  container.bind(ModelRegistry).toConstantValue(modelCatalog.modelRegistry);

  container.bind(TYPES.InferenceProfileRegistry).toConstantValue(modelCatalog.profileRegistry);
  container.bind(InferenceProfileRegistry).toConstantValue(modelCatalog.profileRegistry);

  container.bind(TYPES.AgentModelConfigRegistry).toConstantValue(modelCatalog.agentConfigRegistry);
  container.bind(AgentModelConfigRegistry).toConstantValue(modelCatalog.agentConfigRegistry);

  container.bind(TYPES.ModelConfigResolver).toConstantValue(modelCatalog.resolver);
  container.bind(ModelConfigResolver).toConstantValue(modelCatalog.resolver);

  container.bind(TYPES.PostgresConfigStore).to(PostgresConfigStore).inSingletonScope();
  container.bind(PostgresConfigStore).to(PostgresConfigStore).inSingletonScope();

  container.bind(TYPES.ConfigCache).to(ConfigCache).inSingletonScope();
  container.bind(ConfigCache).to(ConfigCache).inSingletonScope();

  // ─────────────────────────────────────
  // Observability & Event Bus
  // ─────────────────────────────────────
  if (options.eventBus) {
    container.bind(TYPES.EventBus).toConstantValue(options.eventBus);
  } else {
    container.bind(TYPES.EventBus).to(HarnessEventBus).inSingletonScope();
  }
  container.bind(TYPES.TracingService).to(TracingService).inSingletonScope();
  container.bind(TYPES.MetricsService).to(MetricsService).inSingletonScope();

  // ─────────────────────────────────────
  // State & Infrastructure
  // ─────────────────────────────────────
  if (options.keyValueStore) {
    container.bind(TYPES.KeyValueStore).toConstantValue(options.keyValueStore);
  } else {
    container.bind(TYPES.KeyValueStore).to(RedisStore).inSingletonScope();
  }

  if (options.relationalDb) {
    container.bind(TYPES.RelationalDb).toConstantValue(options.relationalDb);
  } else {
    container.bind(TYPES.RelationalDb).to(PostgresStore).inSingletonScope();
  }
  container.bind(TYPES.StateStore).to(PostgresStateStore).inSingletonScope();

  if (options.messageBus) {
    container.bind(TYPES.MessageBus).toConstantValue(options.messageBus);
  } else {
    container.bind(TYPES.MessageBus).to(RedisMessageBus).inSingletonScope();
  }

  // ─────────────────────────────────────
  // Registries & Resolvers
  // ─────────────────────────────────────
  container.bind(TYPES.CapabilityRegistry).to(CapabilityRegistry).inSingletonScope();
  container.bind(TYPES.AgentRegistry).to(AgentRegistry).inSingletonScope();
  container.bind(TYPES.CapabilityResolver).to(CapabilityResolver).inSingletonScope();

  // ─────────────────────────────────────
  // Context & Memory
  // ─────────────────────────────────────
  container.bind(TYPES.TokenManager).to(TokenManager).inSingletonScope();
  container.bind(TYPES.ContextManager).to(ContextManager).inSingletonScope();
  container.bind(TYPES.PromptBuilder).to(PromptBuilder).inSingletonScope();

  if (options.sessionStore) {
    container.bind(TYPES.SessionStore).toConstantValue(options.sessionStore);
  } else {
    container.bind(TYPES.SessionStore).to(PostgresSessionStore).inSingletonScope();
  }

  if (options.contextCompactor) {
    container.bind(TYPES.ContextCompactor).toConstantValue(options.contextCompactor);
  } else {
    container.bind(TYPES.ContextCompactor).to(ContextCompactor).inSingletonScope();
  }

  if (options.longTermMemoryStore) {
    container.bind(TYPES.LongTermMemoryStore).toConstantValue(options.longTermMemoryStore);
  } else {
    container.bind(TYPES.LongTermMemoryStore).to(PostgresLongTermMemoryStore).inSingletonScope();
  }
  container.bind(TYPES.MemoryManager).to(MemoryManager).inSingletonScope();

  // ─────────────────────────────────────
  // Guardrails & Policy Engine
  // ─────────────────────────────────────
  container.bind(TYPES.InputGuard).to(InputGuard).inSingletonScope();
  container.bind(TYPES.ToolGuard).to(ToolGuard).inSingletonScope();
  container.bind(TYPES.OutputGuard).to(OutputGuard).inSingletonScope();
  container.bind(TYPES.PolicyEngine).to(PolicyEngine).inSingletonScope();

  // ─────────────────────────────────────
  // HITL (Checkpoint & Approval Manager)
  // ─────────────────────────────────────
  if (options.checkpointStore) {
    container.bind(TYPES.CheckpointStore).toConstantValue(options.checkpointStore);
  } else {
    container.bind(TYPES.CheckpointStore).to(PostgresCheckpointStore).inSingletonScope();
  }

  if (options.approvalManager) {
    container.bind(TYPES.ApprovalManager).toConstantValue(options.approvalManager);
  } else {
    container.bind(TYPES.ApprovalManager).to(ApprovalManager).inSingletonScope();
  }

  // ─────────────────────────────────────
  // LLM & Model Router
  // ─────────────────────────────────────
  container.bind(TYPES.ModelRouter).to(ModelRouter).inSingletonScope();

  // ─────────────────────────────────────
  // Prompts
  // ─────────────────────────────────────
  if (options.promptProvider) {
    container.bind(TYPES.PromptProvider).toConstantValue(options.promptProvider);
  } else {
    const promptsDir = options.promptsDir ?? "./prompts/agents";
    container
      .bind(TYPES.PromptProvider)
      .toDynamicValue(() => new FilePromptProvider(promptsDir))
      .inSingletonScope();
  }

  // ─────────────────────────────────────
  // Capability Dispatchers & Executors
  // ─────────────────────────────────────
  container.bind(TYPES.ToolExecutor).to(ToolExecutor).inSingletonScope();
  container.bind(TYPES.ToolCapabilityExecutor).to(ToolCapabilityExecutor).inSingletonScope();
  container.bind(TYPES.SubAgentExecutor).to(SubAgentExecutor).inSingletonScope();
  container.bind(TYPES.CapabilityDispatcher).to(CapabilityDispatcher).inSingletonScope();

  // Built-in Tools
  container
    .bind<Tool[]>(TYPES.BuiltinTools)
    .toDynamicValue(() => createBuiltinTools(container.get<MemoryManager>(TYPES.MemoryManager)));

  // ─────────────────────────────────────
  // Orchestration & Planning
  // ─────────────────────────────────────
  container.bind(TYPES.Scheduler).to(Scheduler).inSingletonScope();
  container.bind(TYPES.ExecutionEngine).to(ExecutionEngine).inSingletonScope();

  if (options.planGenerator) {
    container.bind(TYPES.PlanGenerator).toConstantValue(options.planGenerator);
  } else {
    container.bind(TYPES.PlanGenerator).to(StaticPlanGenerator).inSingletonScope();
  }

  container.bind(TYPES.Planner).to(Planner).inSingletonScope();
  container.bind(TYPES.PlanValidator).to(PlanValidator).inSingletonScope();
  container.bind(TYPES.Orchestrator).to(Orchestrator).inSingletonScope();

  // ─────────────────────────────────────
  // Agent Factory & Config Loader
  // ─────────────────────────────────────
  container.bind(TYPES.AgentFactory).to(AgentFactory).inSingletonScope();
  container.bind(TYPES.AgentConfigLoader).to(AgentConfigLoader).inSingletonScope();

  return container;
}
