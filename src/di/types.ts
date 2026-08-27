export const TYPES = {
  // Core Registries & Event Bus
  CapabilityRegistry: Symbol.for("CapabilityRegistry"),
  AgentRegistry: Symbol.for("AgentRegistry"),
  CapabilityResolver: Symbol.for("CapabilityResolver"),
  EventBus: Symbol.for("EventBus"),

  // State & Context Management
  StateStore: Symbol.for("StateStore"),
  SessionStore: Symbol.for("SessionStore"),
  LongTermMemoryStore: Symbol.for("LongTermMemoryStore"),
  MemoryManager: Symbol.for("MemoryManager"),
  ContextCompactor: Symbol.for("ContextCompactor"),
  ContextManager: Symbol.for("ContextManager"),
  TokenManager: Symbol.for("TokenManager"),
  PromptBuilder: Symbol.for("PromptBuilder"),

  // Guardrails & Policy Engine
  InputGuard: Symbol.for("InputGuard"),
  ToolGuard: Symbol.for("ToolGuard"),
  OutputGuard: Symbol.for("OutputGuard"),
  PolicyEngine: Symbol.for("PolicyEngine"),
  CheckpointStore: Symbol.for("CheckpointStore"),
  ApprovalManager: Symbol.for("ApprovalManager"),

  // Observability & Telemetry
  TracingService: Symbol.for("TracingService"),
  MetricsService: Symbol.for("MetricsService"),

  // LLM & Routing
  ModelRouter: Symbol.for("ModelRouter"),

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

  // Infrastructure Adapters
  KeyValueStore: Symbol.for("KeyValueStore"),
  RelationalDb: Symbol.for("RelationalDb"),
  MessageBus: Symbol.for("MessageBus"),

  // Top-Level Harness & Configuration
  AgentHarness: Symbol.for("AgentHarness"),
  HarnessOptions: Symbol.for("HarnessOptions"),
} as const;
