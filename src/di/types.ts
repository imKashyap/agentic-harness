export const TYPES = {
  // Core Registries & Event Bus
  CapabilityRegistry: Symbol.for("CapabilityRegistry"),
  AgentRegistry: Symbol.for("AgentRegistry"),
  CapabilityResolver: Symbol.for("CapabilityResolver"),
  EventBus: Symbol.for("EventBus"),

  // Memory Subsystems
  SessionStore: Symbol.for("SessionStore"),
  LongTermMemoryStore: Symbol.for("LongTermMemoryStore"),
  MemoryManager: Symbol.for("MemoryManager"),
  ContextCompactor: Symbol.for("ContextCompactor"),

  // Human-in-the-Loop (HITL)
  CheckpointStore: Symbol.for("CheckpointStore"),
  ApprovalManager: Symbol.for("ApprovalManager"),

  // Capabilities & Executors
  ToolExecutor: Symbol.for("ToolExecutor"),
  ToolCapabilityExecutor: Symbol.for("ToolCapabilityExecutor"),
  SubAgentExecutor: Symbol.for("SubAgentExecutor"),
  CapabilityDispatcher: Symbol.for("CapabilityDispatcher"),

  // Orchestration & Planning
  Scheduler: Symbol.for("Scheduler"),
  ExecutionEngine: Symbol.for("ExecutionEngine"),
  PlanGenerator: Symbol.for("PlanGenerator"),
  Planner: Symbol.for("Planner"),
  PlanValidator: Symbol.for("PlanValidator"),
  Orchestrator: Symbol.for("Orchestrator"),

  // Agent Infrastructure
  PromptProvider: Symbol.for("PromptProvider"),
  AgentFactory: Symbol.for("AgentFactory"),
  AgentConfigLoader: Symbol.for("AgentConfigLoader"),

  // Top-Level Harness & Configuration
  AgentHarness: Symbol.for("AgentHarness"),
  HarnessOptions: Symbol.for("HarnessOptions"),
} as const;
