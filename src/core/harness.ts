import { AgentCapabilityLoader } from "../capabilities/agents/agent-capability-loader.js";
import { SubAgentExecutor } from "../capabilities/agents/sub-agent-executor.js";
import { Capability } from "../capabilities/capability.js";
import { CapabilityLoader } from "../capabilities/capability-loader.js";
import { CapabilityManager } from "../capabilities/capability-manager.js";
import { CapabilityRegistry } from "../capabilities/capability-registry.js";
import { CapabilityDispatcher } from "../capabilities/dispatch/capability-dispatcher.js";
import { CapabilityResolver } from "../capabilities/resolution/capability-resolver.js";
import { Skill } from "../capabilities/skills/skill.js";
import { SkillLoader } from "../capabilities/skills/skill-loader.js";
import { CalculatorTool } from "../capabilities/tools/examples/calculator-tool.js";
import { Tool } from "../capabilities/tools/tool.js";
import { ToolCapabilityExecutor } from "../capabilities/tools/tool-capability-executor.js";
import { ToolExecutor } from "../capabilities/tools/tool-executor.js";
import { ToolLoader } from "../capabilities/tools/tool-loader.js";
import { AgentNotFoundError } from "../errors/orchestration-errors.js";
import { HarnessEventBus } from "../events/event-bus.js";
import { HarnessEvent } from "../events/types.js";
import { ApprovalManager } from "../hitl/approval-manager.js";
import { InMemoryCheckpointStore } from "../hitl/checkpoint-store.js";
import { Checkpoint, CheckpointStore } from "../hitl/types.js";
import { LLMFactory } from "../llm/llm-factory.js";
import { InMemoryLongTermStore } from "../memory/long-term/in-memory-long-term-store.js";
import { MemoryManager } from "../memory/long-term/memory-manager.js";
import { LongTermMemoryStore } from "../memory/long-term/memory-store.js";
import { ContextCompactor } from "../memory/session/context-compactor.js";
import { InMemorySessionStore } from "../memory/session/in-memory-session-store.js";
import { SessionStore } from "../memory/session/session-store.js";
import { RememberFactTool, SearchMemoryTool } from "../memory/tools/memory-tools.js";
import { MemoryEntry, MemorySearchOptions, MemorySearchResult, Session } from "../memory/types.js";
import { FilePromptProvider } from "../prompts/file-prompt-provider.js";
import { PromptProvider } from "../prompts/prompt-provider.js";
import { createLogger } from "../utils/logger.js";
import { Agent } from "./agent/agent.js";
import { AgentConfig } from "./agent/agent-config.js";
import { AgentConfigLoader } from "./agent/agent-config-loader.js";
import { AgentFactory } from "./agent/agent-factory.js";
import { AgentRegistry } from "./agent/agent-registry.js";
import { AgentRunInput, AgentRunResult } from "./agent/agent-runner.js";
import { ExecutionContext } from "./execution/execution-context.js";
import { AdaptivePlanGenerator } from "./orchestration/adaptive-plan-generator.js";
import { ExecutionEngine } from "./orchestration/execution-engine.js";
import { LLMPlanGenerator } from "./orchestration/llm-plan-generator.js";
import { Orchestrator } from "./orchestration/orchestrator.js";
import { PlanGenerator } from "./orchestration/plan-generator.js";
import { PlanValidator } from "./orchestration/plan-validator.js";
import { Planner } from "./orchestration/planner.js";
import { Scheduler } from "./orchestration/scheduler.js";
import { StaticPlanGenerator } from "./orchestration/static-plan-generator.js";

const logger = createLogger("AgentHarness");

export interface HarnessOptions {
  agentsDir?: string;
  skillsDir?: string;
  promptsDir?: string;
  tools?: Tool[];
  customLoaders?: CapabilityLoader[];
  planGenerator?: PlanGenerator;
  promptProvider?: PromptProvider;
  sessionStore?: SessionStore;
  longTermMemoryStore?: LongTermMemoryStore;
  contextCompactor?: ContextCompactor;
  eventBus?: HarnessEventBus;
  checkpointStore?: CheckpointStore;
  approvalManager?: ApprovalManager;
}

export interface RunAgentOptions {
  sessionId?: string;
  context?: ExecutionContext;
  enableLongTermMemory?: boolean;
}

export class AgentHarness {
  private constructor(
    public readonly capabilityRegistry: CapabilityRegistry,
    public readonly agentRegistry: AgentRegistry,
    public readonly capabilityResolver: CapabilityResolver,
    public readonly orchestrator: Orchestrator,
    public readonly agentFactory: AgentFactory,
    public readonly promptProvider: PromptProvider,
    public readonly sessionStore: SessionStore,
    public readonly memoryManager: MemoryManager,
    public readonly eventBus: HarnessEventBus,
    public readonly checkpointStore: CheckpointStore,
    public readonly approvalManager: ApprovalManager,
  ) {}

  static async init(options: HarnessOptions = {}): Promise<AgentHarness> {
    logger.info("Initializing AgentHarness instance...");

    const agentsDir = options.agentsDir ?? "./agents";
    const skillsDir = options.skillsDir ?? "./skills";
    const promptsDir = options.promptsDir ?? "./prompts/agents";
    const tools = options.tools ?? [new CalculatorTool()];

    const promptProvider = options.promptProvider ?? new FilePromptProvider(promptsDir);
    const capabilityRegistry = new CapabilityRegistry();
    const agentRegistry = new AgentRegistry();
    const capabilityResolver = new CapabilityResolver();
    const eventBus = options.eventBus ?? new HarnessEventBus();

    // ─────────────────────────────────────
    // HITL Subsystem (Checkpoints & Approvals)
    // ─────────────────────────────────────
    const checkpointStore = options.checkpointStore ?? new InMemoryCheckpointStore();
    const approvalManager =
      options.approvalManager ?? new ApprovalManager(checkpointStore, eventBus);

    // ─────────────────────────────────────
    // Memory Subsystem (Short & Long Term)
    // ─────────────────────────────────────
    const sessionStore = options.sessionStore ?? new InMemorySessionStore();
    const longTermMemoryStore = options.longTermMemoryStore ?? new InMemoryLongTermStore();
    const memoryManager = new MemoryManager(longTermMemoryStore);
    const contextCompactor = options.contextCompactor ?? new ContextCompactor();

    // Auto-register memory tools
    const rememberTool = new RememberFactTool(memoryManager);
    const searchMemoryTool = new SearchMemoryTool(memoryManager);

    // ─────────────────────────────────────
    // Capability discovery
    // ─────────────────────────────────────
    const loaders: CapabilityLoader[] = [
      new SkillLoader(skillsDir),
      new AgentCapabilityLoader(agentsDir),
      new ToolLoader([...tools, rememberTool, searchMemoryTool]),
      ...(options.customLoaders ?? []),
    ];

    const capabilityManager = new CapabilityManager(capabilityRegistry, loaders);
    await capabilityManager.load();

    // ─────────────────────────────────────
    // Execution and Orchestration
    // ─────────────────────────────────────
    const toolExecutor = new ToolExecutor();
    const toolCapabilityExecutor = new ToolCapabilityExecutor(capabilityRegistry, toolExecutor);
    const subAgentExecutor = new SubAgentExecutor(agentRegistry);

    const capabilityDispatcher = new CapabilityDispatcher(
      capabilityRegistry,
      toolCapabilityExecutor,
      subAgentExecutor,
    );

    const scheduler = new Scheduler();
    const executionEngine = new ExecutionEngine(
      capabilityDispatcher,
      scheduler,
      eventBus,
      capabilityRegistry,
      approvalManager,
    );

    // Adaptive Planner setup (Fast-path for single/zero tool calls, LLM for multi-call DAGs)
    const staticGenerator = new StaticPlanGenerator();
    const llmGenerator = new LLMPlanGenerator(
      LLMFactory.create({ provider: "openrouter", model: "gemma-4-31b-it" }),
      capabilityRegistry,
    );
    const planGenerator =
      options.planGenerator ?? new AdaptivePlanGenerator(staticGenerator, llmGenerator);

    const planner = new Planner(planGenerator, capabilityRegistry);
    const planValidator = new PlanValidator(capabilityRegistry);
    const orchestrator = new Orchestrator(planner, executionEngine, planValidator);

    // ─────────────────────────────────────
    // Agent Factory & Registration
    // ─────────────────────────────────────
    const agentFactory = new AgentFactory(
      capabilityRegistry,
      orchestrator,
      promptProvider,
      capabilityResolver,
      memoryManager,
      contextCompactor,
      eventBus,
    );

    const harness = new AgentHarness(
      capabilityRegistry,
      agentRegistry,
      capabilityResolver,
      orchestrator,
      agentFactory,
      promptProvider,
      sessionStore,
      memoryManager,
      eventBus,
      checkpointStore,
      approvalManager,
    );

    // Load available agent configs
    const configLoader = new AgentConfigLoader();
    try {
      const defaultAgentConfig = await configLoader.load(`${agentsDir}/default-agent/agent.json`);
      harness.registerAgent(defaultAgentConfig);
    } catch {
      logger.debug("No default-agent config found in agents directory");
    }

    try {
      const researcherAgentConfig = await configLoader.load(`${agentsDir}/researcher/agent.json`);
      harness.registerAgent(researcherAgentConfig);
    } catch {
      logger.debug("No researcher agent config found in agents directory");
    }

    logger.info("AgentHarness initialized successfully with memory, event bus, and HITL gates");
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
    options: { agentId?: string; sessionId?: string; tags?: string[] } = {},
  ): Promise<MemoryEntry> {
    return this.memoryManager.remember(content, options);
  }

  async recall(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
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
    const result = await agent.run(runInput, parentContext);

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
      parentRunId: options.context?.parentRunId,
      parentAgentId: options.context?.parentAgentId,
      metadata: options.context?.metadata,
    };

    logger.info(`Starting streaming run for agent '${agentId}' (runId: ${runId})`);

    const stream = this.eventBus.subscribeToRun(runId);

    // Execute run in background; events will be streamed through eventBus
    this.runAgent(agentId, input, { ...options, context: runContext }).catch((err) => {
      logger.debug(`Background stream run error handled via eventBus: ${String(err)}`);
    });

    for await (const event of stream) {
      yield event;
    }
  }
}
