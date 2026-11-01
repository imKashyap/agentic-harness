import "reflect-metadata";

import { Container, inject, injectable } from "inversify";

import { Capability } from "../capabilities/capability.js";
import { CapabilityLoader, CapabilityLoaderInterface } from "../capabilities/capability-loader.js";
import { CapabilityManager } from "../capabilities/capability-manager.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { CapabilityResolver } from "../capabilities/resolution/capability-resolver.js";
import { Skill } from "../capabilities/skills/skill.js";
import { Tool } from "../capabilities/tools/tool.js";
import { createHarnessContainer } from "../di/container.js";
import { TYPES } from "../di/types.js";
import { AgentNotFoundError } from "../errors/orchestration-errors.js";
import { HarnessEventBus } from "../events/event-bus.js";
import { HarnessEvent } from "../events/types.js";
import { ApprovalManager } from "../hitl/approval-manager.js";
import type { Checkpoint, CheckpointStore } from "../hitl/types.js";
import type { MessageBus } from "../infrastructure/messaging/message-bus.js";
import type { RelationalDb } from "../infrastructure/postgres/postgres-store.js";
import type { KeyValueStore } from "../infrastructure/redis/redis-store.js";
import { ConfigCache } from "../llm/configuration/config-cache.js";
import { MemoryManager } from "../memory/long-term/memory-manager.js";
import type { LongTermMemoryStore } from "../memory/long-term/memory-store.js";
import { ContextCompactor } from "../memory/session/context-compactor.js";
import type { SessionStore } from "../memory/session/session-store.js";
import { MemoryEntry, MemorySearchOptions, MemorySearchResult, Session } from "../memory/types.js";
import type { PromptProvider } from "../prompts/prompt-provider.js";
import { createLogger } from "../utils/logger.js";
import { Agent } from "./agent/agent.js";
import { AgentConfig } from "./agent/agent-config.js";
import { AgentConfigLoader } from "./agent/agent-config-loader.js";
import { AgentFactory } from "./agent/agent-factory.js";
import { AgentRegistry } from "./agent/agent-registry.js";
import { AgentRunInput, AgentRunResult } from "./agent/agent-runner.js";
import { ExecutionContext } from "./execution/execution-context.js";
import { Orchestrator } from "./orchestration/orchestrator.js";
import type { PlanGenerator } from "./orchestration/plan-generator.js";

const logger = createLogger("AgentHarness");

export interface HarnessOptions {
  agentsDir?: string;
  modelsConfigPath?: string;
  skillsDir?: string;
  toolsDir?: string;
  promptsDir?: string;
  tools?: Tool[];
  customLoaders?: CapabilityLoaderInterface[];
  planGenerator?: PlanGenerator;
  promptProvider?: PromptProvider;
  sessionStore?: SessionStore;
  longTermMemoryStore?: LongTermMemoryStore;
  contextCompactor?: ContextCompactor;
  eventBus?: HarnessEventBus;
  checkpointStore?: CheckpointStore;
  approvalManager?: ApprovalManager;
  relationalDb?: RelationalDb;
  keyValueStore?: KeyValueStore;
  messageBus?: MessageBus;
}

export interface RunAgentOptions {
  sessionId?: string;
  /** Trusted identity supplied by the embedding application, never request/model input. */
  principalId?: string;
  context?: ExecutionContext;
  enableLongTermMemory?: boolean;
}

@injectable()
export class AgentHarness {
  public container?: Container;

  constructor(
    @inject(TYPES.CapabilityRegistry) public readonly capabilityRegistry: CapabilityRegistry,
    @inject(TYPES.AgentRegistry) public readonly agentRegistry: AgentRegistry,
    @inject(TYPES.CapabilityResolver) public readonly capabilityResolver: CapabilityResolver,
    @inject(TYPES.Orchestrator) public readonly orchestrator: Orchestrator,
    @inject(TYPES.AgentFactory) public readonly agentFactory: AgentFactory,
    @inject(TYPES.PromptProvider) public readonly promptProvider: PromptProvider,
    @inject(TYPES.SessionStore) public readonly sessionStore: SessionStore,
    @inject(TYPES.MemoryManager) public readonly memoryManager: MemoryManager,
    @inject(TYPES.EventBus) public readonly eventBus: HarnessEventBus,
    @inject(TYPES.CheckpointStore) public readonly checkpointStore: CheckpointStore,
    @inject(TYPES.ApprovalManager) public readonly approvalManager: ApprovalManager,
  ) {}

  static async init(options: HarnessOptions = {}): Promise<AgentHarness> {
    logger.info("Initializing AgentHarness instance via Inversify DI container...");

    const container = createHarnessContainer(options);
    container.bind(TYPES.AgentHarness).to(AgentHarness).inSingletonScope();

    const relationalDb = container.get<RelationalDb>(TYPES.RelationalDb);
    await relationalDb.initialize?.();
    await container.get<KeyValueStore>(TYPES.KeyValueStore).initialize?.();
    await container.get<MessageBus>(TYPES.MessageBus).initialize?.();

    const capabilityRegistry = container.get<CapabilityRegistry>(TYPES.CapabilityRegistry);
    const configLoader = container.get<AgentConfigLoader>(TYPES.AgentConfigLoader);
    const agentsDir = options.agentsDir ?? "./agents";
    const skillsDir = options.skillsDir ?? "./skills";
    const toolsDir = options.toolsDir ?? "./tools";
    const tools = options.tools ?? [];

    const builtinTools = container.isBound(TYPES.BuiltinTools)
      ? container.get<Tool[]>(TYPES.BuiltinTools)
      : [];

    // ─────────────────────────────────────
    // Capability discovery (agent-driven)
    // ─────────────────────────────────────
    const capabilityLoader = new CapabilityLoader({
      agentsDir,
      skillsDir,
      toolsDir,
      inMemoryTools: [...tools, ...builtinTools],
    });

    const loaders: CapabilityLoaderInterface[] = [
      capabilityLoader,
      ...(options.customLoaders ?? []),
    ];

    const capabilityManager = new CapabilityManager(capabilityRegistry, loaders);
    await capabilityManager.load();

    const harness = container.get<AgentHarness>(TYPES.AgentHarness);
    harness.container = container;
    await container.get<ConfigCache>(TYPES.ConfigCache).initialize();

    // Register all discovered agent configs into AgentRegistry
    const discoveredConfigs = capabilityLoader.getDiscoveredAgentConfigs();
    for (const agentConfig of discoveredConfigs) {
      if (!harness.agentRegistry.has(agentConfig.id)) {
        harness.registerAgent(agentConfig);
        logger.info(`Registered runnable agent '${agentConfig.id}' from discovered file config`);
      }
    }

    // Fallback: Ensure supervisor is registered if present and not already registered
    if (!harness.agentRegistry.has("supervisor")) {
      await registerAgentConfigIfPresent(
        configLoader,
        harness,
        `${agentsDir}/supervisor/agent.json`,
        "supervisor",
      );
    }

    logger.info("AgentHarness initialized successfully via Inversify container");
    return harness;
  }

  registerAgent(config: AgentConfig): Agent {
    const agent = this.agentFactory.create(config);
    this.agentRegistry.register(config.id, agent);
    return agent;
  }

  registerTool(tool: Tool): void {
    this.capabilityRegistry.register(tool);
  }

  registerSkill(skill: Skill): void {
    this.capabilityRegistry.register(skill);
  }

  getAgent(agentId: string): Agent {
    return this.agentRegistry.get(agentId);
  }

  listAgents(): Array<{ id: string }> {
    return this.agentRegistry.getAll().map((agent) => ({ id: agent.id }));
  }

  listCapabilities(): Capability[] {
    return this.capabilityRegistry.getAll();
  }

  // ─────────────────────────────────────
  // Session & Long-Term Memory APIs
  // ─────────────────────────────────────

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessionStore.get(sessionId);
  }

  async listSessions(agentId?: string): Promise<Session[]> {
    return this.sessionStore.list(agentId);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessionStore.delete(sessionId);
  }

  async remember(
    content: string,
    options: {
      principalId: string;
      agentId?: string;
      sessionId?: string;
      tags?: string[];
      scope?: "user" | "agent";
    },
  ): Promise<MemoryEntry> {
    return this.memoryManager.remember(content, options);
  }

  async recall(query: string, options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    return this.memoryManager.recall(query, options);
  }

  // ─────────────────────────────────────
  // Human-in-the-Loop (HITL) APIs
  // ─────────────────────────────────────

  async approveRun(
    idOrRunId: string,
    reason?: string,
  ): Promise<{ success: boolean; checkpoint: Checkpoint | null }> {
    return this.approvalManager.resolveDecision(idOrRunId, { status: "approved", reason });
  }

  async rejectRun(
    idOrRunId: string,
    reason?: string,
  ): Promise<{ success: boolean; checkpoint: Checkpoint | null }> {
    return this.approvalManager.resolveDecision(idOrRunId, { status: "rejected", reason });
  }

  async listPendingApprovals(): Promise<Checkpoint[]> {
    return this.approvalManager.listPending();
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.checkpointStore.get(id);
  }

  // ─────────────────────────────────────
  // Execution & Streaming APIs
  // ─────────────────────────────────────

  async runAgent(
    agentId: string,
    input: string | AgentRunInput,
    options: RunAgentOptions | ExecutionContext = {},
  ): Promise<AgentRunResult> {
    if (!this.agentRegistry.has(agentId)) {
      throw new AgentNotFoundError(agentId);
    }

    const agent = this.agentRegistry.get(agentId);

    // Normalize options
    const isExecutionContext = "runId" in options;
    const parentContext: ExecutionContext | undefined = isExecutionContext
      ? (options as ExecutionContext)
      : (options as RunAgentOptions).context;

    const runOptions: RunAgentOptions = isExecutionContext ? {} : (options as RunAgentOptions);
    const executionContext = parentContext
      ? { ...parentContext, principalId: runOptions.principalId ?? parentContext.principalId }
      : runOptions.principalId
        ? {
            runId: crypto.randomUUID(),
            agentId,
            principalId: runOptions.principalId,
          }
        : undefined;

    let runInput: AgentRunInput;
    if (typeof input === "string") {
      runInput = {
        message: input,
        sessionId: runOptions.sessionId,
        enableLongTermMemory: runOptions.enableLongTermMemory,
      };
    } else {
      runInput = {
        ...input,
        sessionId: input.sessionId ?? runOptions.sessionId,
        enableLongTermMemory: input.enableLongTermMemory ?? runOptions.enableLongTermMemory,
      };
    }

    // Short-term session integration
    let existingSession: Session | null = null;
    if (runInput.sessionId) {
      existingSession = await this.sessionStore.get(runInput.sessionId);
      if (existingSession) {
        runInput.history = existingSession.messages;
        logger.info(
          `Loaded existing session [${runInput.sessionId}] with ${existingSession.messages.length} previous messages`,
        );
      } else {
        logger.info(`Starting new session [${runInput.sessionId}] for agent '${agentId}'`);
      }
    }

    logger.info(`Running agent '${agentId}' via harness facade`);
    const result = await agent.run(runInput, executionContext);

    // Persist updated session
    if (runInput.sessionId) {
      const sessionToSave: Session = {
        id: runInput.sessionId,
        agentId,
        messages: result.messages,
        createdAt: existingSession?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await this.sessionStore.save(sessionToSave);
      logger.info(
        `Updated session [${runInput.sessionId}] (total messages: ${result.messages.length})`,
      );
    }

    return result;
  }

  async *runAgentStream(
    agentId: string,
    input: string | AgentRunInput,
    options: RunAgentOptions = {},
  ): AsyncIterable<HarnessEvent> {
    const runId = options.context?.runId ?? crypto.randomUUID();
    const runContext: ExecutionContext = {
      runId,
      agentId,
      principalId: options.principalId ?? options.context?.principalId,
      parentRunId: options.context?.parentRunId,
      parentAgentId: options.context?.parentAgentId,
      metadata: options.context?.metadata,
    };

    logger.info(`Starting streaming run for agent '${agentId}' (runId: ${runId})`);

    const stream = this.eventBus.subscribeToRun(runId);

    // Execute run in background; events will be streamed through eventBus
    this.runAgent(agentId, input, { ...options, context: runContext }).catch((err) => {
      logger.debug(`Background stream run error handled via eventBus: ${String(err)}`);
      this.eventBus.emit("run:error", {
        runId,
        agentId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
    });

    for await (const event of stream) {
      yield event;
    }
  }

  // ─────────────────────────────────────
  // Event Subscription Facade
  // ─────────────────────────────────────

  onEvent(event: HarnessEvent["type"], handler: (data: unknown) => void): void {
    if (this.eventBus) {
      this.eventBus.on(event, handler);
    }
  }
}

async function registerAgentConfigIfPresent(
  configLoader: AgentConfigLoader,
  harness: AgentHarness,
  path: string,
  agentId: string,
): Promise<void> {
  try {
    harness.registerAgent(await configLoader.load(path));
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      logger.debug(`No ${agentId} config found at '${path}'`);
      return;
    }
    throw error;
  }
}
