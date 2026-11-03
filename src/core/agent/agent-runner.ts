import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityResolver } from "../../capabilities/resolution/capability-resolver.js";
import { AgentExecutionError } from "../../errors/orchestration-errors.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { ConfigCache } from "../../llm/configuration/config-cache.js";
import {
  AgentDefinition,
  LLM,
  LLMResponse,
  Message,
  ToolCall,
  ToolDefinition,
} from "../../llm/types.js";
import { MemoryManager } from "../../memory/long-term/memory-manager.js";
import { ContextCompactor } from "../../memory/session/context-compactor.js";
import { withTimeout } from "../../resilience/index.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { ExecutionResult } from "../execution/execution-result.js";
import { DEFERRED_CALL_GUIDANCE } from "../orchestration/deferred-call-guidance.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { RuntimeAgentConfig } from "./agent-config.js";

export interface AgentRunInput {
  message: string;
  sessionId?: string;
  history?: Message[];
  enableLongTermMemory?: boolean;
  timeoutMs?: number;
}

export interface AgentRunResult {
  response: string;
  messages: Message[];
  sessionId?: string;
}

const logger = createLogger("AgentRunner");

export const DEFAULT_AGENT_TIMEOUT_MS = 300000; // 5 minutes

export class AgentRunner {
  private readonly capabilityResolver: CapabilityResolver;
  private readonly contextCompactor: ContextCompactor;

  constructor(
    private readonly config: RuntimeAgentConfig,
    private readonly llm: LLM,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly orchestrator: Orchestrator,
    capabilityResolver?: CapabilityResolver,
    private readonly memoryManager?: MemoryManager,
    contextCompactor?: ContextCompactor,
    private readonly eventBus?: HarnessEventBus,
    private readonly configCache?: ConfigCache,
  ) {
    this.capabilityResolver = capabilityResolver ?? new CapabilityResolver();
    this.contextCompactor = contextCompactor ?? new ContextCompactor();
  }

  async run(
    input: AgentRunInput,
    context: ExecutionContext,
    systemPrompt: string,
  ): Promise<AgentRunResult> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
    const allowedCapabilities = this.capabilityResolver.resolveAllowedCapabilitiesForAgent(
      this.config,
      this.capabilityRegistry,
    );
    const scopedContext: ExecutionContext = {
      ...context,
      allowedCapabilities,
      memoryScope: this.config.memory?.scope ?? "user",
    };
    return withTimeout(
      async () => this.executeRunLoop(input, scopedContext, systemPrompt),
      timeoutMs,
      `Agent '${this.config.id}' run`,
    );
  }

  private async executeRunLoop(
    input: AgentRunInput,
    context: ExecutionContext,
    systemPrompt: string,
  ): Promise<AgentRunResult> {
    const startTime = Date.now();
    logger.info(
      `Starting run loop for agent '${this.config.id}' (runId: ${context.runId}${
        input.sessionId ? `, sessionId: ${input.sessionId}` : ""
      })`,
    );

    this.eventBus?.emit("run:start", {
      runId: context.runId,
      agentId: this.config.id,
      sessionId: input.sessionId,
      input: input.message,
      timestamp: startTime,
    });

    // Pin configuration on ExecutionContext for duration of this run/DAG
    if (this.configCache) {
      try {
        this.configCache.resolve(this.config.id, context);
      } catch (err) {
        logger.debug(`ConfigCache pinning skipped: ${String(err)}`);
      }
    }

    try {
      // 1. Resolve skills
      const assignedSkills = this.capabilityResolver.resolveSkillsForAgent(
        this.config,
        this.capabilityRegistry,
      );
      const skillsPromptSection = this.capabilityResolver.formatSkillsPrompt(assignedSkills);

      if (assignedSkills.length > 0) {
        logger.info(
          `Injected ${assignedSkills.length} skill(s) into system prompt for agent '${this.config.id}'`,
        );
      }

      // 2. Resolve tools
      const assignedTools = this.capabilityResolver.resolveToolsForAgent(
        this.config,
        this.capabilityRegistry,
      );
      const toolsPromptSection = this.capabilityResolver.formatToolsPrompt(assignedTools);

      if (assignedTools.length > 0) {
        logger.info(
          `Injected ${assignedTools.length} tool(s) into system prompt for agent '${this.config.id}'`,
        );
      }

      // 3. Resolve sub-agents
      const assignedAgents = this.capabilityResolver.resolveAgentsForAgent(
        this.config,
        this.capabilityRegistry,
      );
      const subAgentsPromptSection = this.capabilityResolver.formatSubAgentsPrompt(assignedAgents);

      if (assignedAgents.length > 0) {
        logger.info(
          `Injected ${assignedAgents.length} sub-agent(s) into system prompt for agent '${this.config.id}'`,
        );
      }

      // 4. Recall Long-Term Memory (if enabled and manager available)
      let memoryPromptSection = "";
      if (
        this.memoryManager &&
        this.config.memory?.autoRecall === true &&
        input.enableLongTermMemory !== false &&
        context.principalId
      ) {
        try {
          const recalled = await this.memoryManager.recall(input.message, {
            principalId: context.principalId,
            scope: this.config.memory?.scope ?? "user",
            agentId: this.config.id,
            limit: 4,
          });
          memoryPromptSection = this.memoryManager.formatMemoryPrompt(recalled);
          if (recalled.length > 0) {
            logger.info(
              `Injected ${recalled.length} long-term memory fact(s) into system prompt for agent '${this.config.id}'`,
            );
            this.eventBus?.emit("memory:recalled", {
              runId: context.runId,
              agentId: this.config.id,
              query: input.message,
              matchCount: recalled.length,
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          logger.warn(`Failed to recall long-term memory: ${String(err)}`);
        }
      }

      const fullSystemPrompt =
        systemPrompt +
        skillsPromptSection +
        toolsPromptSection +
        subAgentsPromptSection +
        memoryPromptSection +
        (assignedTools.length > 0 ? DEFERRED_CALL_GUIDANCE : "");

      // 5. Assemble message history
      const previousHistory = (input.history ?? []).filter((m) => m.role !== "system");

      const rawMessages: Message[] = [
        {
          role: "system",
          content: fullSystemPrompt,
        },
        ...previousHistory,
        {
          role: "user",
          content: input.message,
        },
      ];

      // 4. Apply Context Compactor to enforce limits while preserving tool-call integrity
      const messages = this.contextCompactor.compact(rawMessages);

      const maxIterations = 10;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const toolDefs = this.getToolDefinitions();
        const agentDefs = this.getAgentDefinitions();

        logger.info(
          `Agent '${this.config.id}' iteration ${iteration + 1}/${maxIterations} (messages: ${
            messages.length
          }, tools: ${toolDefs.length}, sub-agents: ${agentDefs.length})`,
        );

        const response = await this.callLLM(messages, toolDefs, agentDefs, context.runId);

        if (!response.toolCalls || response.toolCalls.length === 0) {
          logger.info(`Agent '${this.config.id}' completed run with final textual response`);
          messages.push({
            role: "assistant",
            content: response.content,
          });

          const durationMs = Date.now() - startTime;
          this.eventBus?.emit("run:end", {
            runId: context.runId,
            agentId: this.config.id,
            sessionId: input.sessionId,
            response: response.content,
            durationMs,
            totalMessages: messages.length,
            timestamp: Date.now(),
          });

          return {
            response: response.content,
            messages,
            sessionId: input.sessionId,
          };
        }

        const allowed = new Set(context.allowedCapabilities ?? []);
        const deniedCalls = response.toolCalls.filter((toolCall) => !allowed.has(toolCall.name));
        if (deniedCalls.length > 0) {
          throw new AgentExecutionError(
            this.config.id,
            `Model requested unauthorized capabilities: ${deniedCalls.map((call) => call.name).join(", ")}`,
            { deniedCapabilities: deniedCalls.map((call) => call.name) },
          );
        }

        logger.info(
          `Agent '${this.config.id}' requested ${response.toolCalls.length} tool call(s): [${response.toolCalls
            .map((tc) => tc.name)
            .join(", ")}]`,
        );

        this.eventBus?.emit("tool:call", {
          runId: context.runId,
          agentId: this.config.id,
          toolCalls: response.toolCalls,
          timestamp: Date.now(),
        });

        messages.push({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        });

        this.eventBus?.emit("plan:start", {
          runId: context.runId,
          agentId: this.config.id,
          toolCallCount: response.toolCalls.length,
          timestamp: Date.now(),
        });

        if (response.toolCalls.length > 1) {
          this.eventBus?.emit("progressive:message", {
            runId: context.runId,
            agentId: this.config.id,
            stage: "planning",
            message: `Planning execution of ${response.toolCalls.length} tool actions in parallel...`,
            timestamp: Date.now(),
          });
        }

        const plan = await this.orchestrator.plan({
          toolCalls: response.toolCalls,
          context,
        });

        this.eventBus?.emit("plan:generated", {
          runId: context.runId,
          agentId: this.config.id,
          plan,
          timestamp: Date.now(),
        });

        const results = await this.orchestrator.execute(plan, context);

        messages.push(...this.toToolMessages(response.toolCalls, results));
      }

      const errorMessage = `Exceeded maximum iterations: ${maxIterations}`;
      logger.error(`Agent '${this.config.id}' ${errorMessage}`);
      throw new AgentExecutionError(this.config.id, errorMessage, { maxIterations });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.eventBus?.emit("run:error", {
        runId: context.runId,
        agentId: this.config.id,
        sessionId: input.sessionId,
        error: errorMsg,
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  /**
   * Calls the LLM, preferring streaming (emitting token:delta events as chunks
   * arrive) when the adapter supports it; falls back to a blocking chat call
   * otherwise (emitting the full content as a single token:delta).
   */
  private async callLLM(
    messages: Message[],
    toolDefs: ToolDefinition[],
    agentDefs: AgentDefinition[],
    runId: string,
  ): Promise<LLMResponse> {
    const request = {
      messages,
      tools: toolDefs,
      agents: agentDefs,
      model: this.config.model.model,
      temperature: this.config.model.generation?.temperature,
      maxTokens: this.config.model.generation?.maxTokens,
      topP: this.config.model.generation?.topP,
    };

    // Use streaming when available on LLM adapter
    if (typeof this.llm.chatStream === "function") {
      let accumulatedContent = "";
      let finalResponse: LLMResponse | undefined;

      const stream = this.llm.chatStream(request);

      for await (const chunk of stream) {
        if (chunk.delta) {
          accumulatedContent += chunk.delta;
          this.eventBus?.emit("token:delta", {
            runId,
            agentId: this.config.id,
            delta: chunk.delta,
            timestamp: Date.now(),
          });
        }
        if (chunk.fullResponse) {
          finalResponse = chunk.fullResponse;
        }
      }

      return finalResponse ?? { content: accumulatedContent };
    }

    const response = await this.llm.chat(request);
    if (response.content) {
      this.eventBus?.emit("token:delta", {
        runId,
        agentId: this.config.id,
        delta: response.content,
        timestamp: Date.now(),
      });
    }
    return response;
  }

  /**
   * Converts execution results into tool-role messages for the next LLM turn.
   * Tasks with no result (skipped due to a prior failure) and failed tasks are
   * reported as JSON error payloads; successful outputs are passed through as-is.
   */
  private toToolMessages(toolCalls: ToolCall[], results: ExecutionResult[]): Message[] {
    const resultsByTaskId = new Map(results.map((r) => [r.taskId, r]));

    return toolCalls.map((toolCall) => {
      const result = resultsByTaskId.get(toolCall.id);

      let contentStr: string;
      if (!result) {
        logger.warn(`Task [${toolCall.id}] had no execution result (skipped due to prior error)`);
        contentStr = JSON.stringify({
          error: "Task was skipped or not executed due to prior failure",
          status: "skipped",
        });
      } else if (result.status === "failed") {
        logger.warn(`Task [${toolCall.id}] failed: ${result.error ?? "Unknown error"}`);
        contentStr = JSON.stringify({
          error: result.error ?? "Execution failed",
          output: result.output ?? null,
          status: "failed",
        });
      } else {
        contentStr =
          typeof result.output === "string" ? result.output : JSON.stringify(result.output ?? null);
      }

      return {
        role: "tool" as const,
        toolCallId: toolCall.id,
        name: toolCall.name,
        content: contentStr,
      };
    });
  }

  /**
   * Recalls long-term memory for the current input when auto-recall is enabled,
   * returning the formatted prompt section (empty string when disabled, on no
   * match, or on recall failure).
   */
  private async recallMemorySection(
    input: AgentRunInput,
    context: ExecutionContext,
  ): Promise<string> {
    if (
      !this.memoryManager ||
      this.config.memory?.autoRecall !== true ||
      input.enableLongTermMemory === false ||
      !context.principalId
    ) {
      return "";
    }

    try {
      const recalled = await this.memoryManager.recall(input.message, {
        principalId: context.principalId,
        scope: this.config.memory?.scope ?? "user",
        agentId: this.config.id,
        limit: 4,
      });
      const section = this.memoryManager.formatMemoryPrompt(recalled);
      if (recalled.length > 0) {
        logger.info(
          `Injected ${recalled.length} long-term memory fact(s) into system prompt for agent '${this.config.id}'`,
        );
        this.eventBus?.emit("memory:recalled", {
          runId: context.runId,
          agentId: this.config.id,
          query: input.message,
          matchCount: recalled.length,
          timestamp: Date.now(),
        });
      }
      return section;
    } catch (err) {
      logger.warn(`Failed to recall long-term memory: ${String(err)}`);
      return "";
    }
  }

  private getToolDefinitions(): ToolDefinition[] {
    return this.capabilityResolver
      .resolveToolsForAgent(this.config, this.capabilityRegistry)
      .map((tool) => {
        const returns = this.capabilityResolver.formatOutputSchema(tool.outputSchema).trim();
        const description = returns ? `${tool.description}\n${returns}` : tool.description;
        return {
          name: tool.id,
          description,
          inputSchema: tool.inputSchema,
        };
      });
  }

  private getAgentDefinitions(): AgentDefinition[] {
    return this.capabilityResolver
      .resolveAgentsForAgent(this.config, this.capabilityRegistry)
      .map((agent) => {
        const returns = (
          agent.outputSchema
            ? this.capabilityResolver.formatOutputSchema(agent.outputSchema)
            : "\nReturns:\n  - `response` (string): Detailed answer or task resolution from this sub-agent."
        ).trim();
        const description = returns ? `${agent.description}\n${returns}` : agent.description;
        return {
          name: agent.id,
          description,
          inputSchema: {
            type: "object",
            properties: {
              task: {
                type: "string",
                description: "Task that should be delegated to this agent",
              },
            },
            required: ["task"],
          },
        };
      });
  }
}
