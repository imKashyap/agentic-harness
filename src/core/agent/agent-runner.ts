import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityResolver } from "../../capabilities/resolution/capability-resolver.js";
import { AgentExecutionError } from "../../errors/orchestration-errors.js";
import { HarnessEventBus } from "../../events/event-bus.js";
import { ConfigCache } from "../../llm/configuration/config-cache.js";
import { AgentDefinition, LLM, LLMResponse, Message, ToolDefinition } from "../../llm/types.js";
import { MemoryManager } from "../../memory/long-term/memory-manager.js";
import { ContextCompactor } from "../../memory/session/context-compactor.js";
import { withTimeout } from "../../resilience/index.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
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
    return withTimeout(
      async () => this.executeRunLoop(input, context, systemPrompt),
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

      // 2. Recall Long-Term Memory (if enabled and manager available)
      let memoryPromptSection = "";
      if (this.memoryManager && input.enableLongTermMemory !== false) {
        try {
          const recalled = await this.memoryManager.recall(input.message, {
            agentId: this.config.id,
            sessionId: input.sessionId,
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

      const fullSystemPrompt = systemPrompt + skillsPromptSection + memoryPromptSection;

      // 3. Assemble message history
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

        let response: LLMResponse;

        // Use streaming when available on LLM adapter
        if (typeof this.llm.chatStream === "function") {
          let accumulatedContent = "";
          let finalResponse: LLMResponse | undefined;

          const stream = this.llm.chatStream({
            messages,
            tools: toolDefs,
            agents: agentDefs,
            model: this.config.model.model,
            temperature: this.config.model.generation?.temperature,
            maxTokens: this.config.model.generation?.maxTokens,
            topP: this.config.model.generation?.topP,
          });

          for await (const chunk of stream) {
            if (chunk.delta) {
              accumulatedContent += chunk.delta;
              this.eventBus?.emit("token:delta", {
                runId: context.runId,
                agentId: this.config.id,
                delta: chunk.delta,
                timestamp: Date.now(),
              });
            }
            if (chunk.fullResponse) {
              finalResponse = chunk.fullResponse;
            }
          }

          response = finalResponse ?? { content: accumulatedContent };
        } else {
          response = await this.llm.chat({
            messages,
            tools: toolDefs,
            agents: agentDefs,
            model: this.config.model.model,
            temperature: this.config.model.generation?.temperature,
            maxTokens: this.config.model.generation?.maxTokens,
            topP: this.config.model.generation?.topP,
          });

          if (response.content) {
            this.eventBus?.emit("token:delta", {
              runId: context.runId,
              agentId: this.config.id,
              delta: response.content,
              timestamp: Date.now(),
            });
          }
        }

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

        const resultsByTaskId = new Map(results.map((r) => [r.taskId, r]));

        for (const toolCall of response.toolCalls) {
          const result = resultsByTaskId.get(toolCall.id);

          let contentStr: string;
          if (!result) {
            logger.warn(
              `Task [${toolCall.id}] had no execution result (skipped due to prior error)`,
            );
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
              typeof result.output === "string"
                ? result.output
                : JSON.stringify(result.output ?? null);
          }

          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: contentStr,
          });
        }
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

  private getToolDefinitions(): ToolDefinition[] {
    return this.capabilityResolver
      .resolveToolsForAgent(this.config, this.capabilityRegistry)
      .map((tool) => ({
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
  }

  private getAgentDefinitions(): AgentDefinition[] {
    return this.capabilityResolver
      .resolveAgentsForAgent(this.config, this.capabilityRegistry)
      .map((agent) => ({
        name: agent.id,
        description: agent.description,
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
      }));
  }
}
