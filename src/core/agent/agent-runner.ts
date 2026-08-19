import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityResolver } from "../../capabilities/resolution/capability-resolver.js";
import { AgentDefinition, LLM, Message, ToolDefinition } from "../../llm/model.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { AgentConfig } from "./agent-config.js";

export interface AgentRunInput {
  message: string;
}

export interface AgentRunResult {
  response: string;
}

const logger = createLogger("AgentRunner");

export class AgentRunner {
  private readonly capabilityResolver: CapabilityResolver;

  constructor(
    private readonly config: AgentConfig,
    private readonly llm: LLM,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly orchestrator: Orchestrator,
    capabilityResolver?: CapabilityResolver,
  ) {
    this.capabilityResolver = capabilityResolver ?? new CapabilityResolver();
  }

  async run(
    input: AgentRunInput,
    context: ExecutionContext,
    systemPrompt: string,
  ): Promise<AgentRunResult> {
    logger.info(`Starting run loop for agent '${this.config.id}' (runId: ${context.runId})`);

    const assignedSkills = this.capabilityResolver.resolveSkillsForAgent(
      this.config,
      this.capabilityRegistry,
    );
    const skillsPromptSection = this.capabilityResolver.formatSkillsPrompt(assignedSkills);
    const fullSystemPrompt = systemPrompt + skillsPromptSection;

    if (assignedSkills.length > 0) {
      logger.info(
        `Injected ${assignedSkills.length} skill(s) into system prompt for agent '${this.config.id}'`,
      );
    }

    const messages: Message[] = [
      {
        role: "system",
        content: fullSystemPrompt,
      },
      {
        role: "user",
        content: input.message,
      },
    ];

    const maxIterations = 10;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const toolDefs = this.getToolDefinitions();
      const agentDefs = this.getAgentDefinitions();

      logger.info(
        `Agent '${this.config.id}' iteration ${iteration + 1}/${maxIterations} (messages: ${
          messages.length
        }, tools: ${toolDefs.length}, sub-agents: ${agentDefs.length})`,
      );

      const response = await this.llm.chat({
        messages,
        tools: toolDefs,
        agents: agentDefs,
        model: this.config.model.model,
        temperature: this.config.model.generation?.temperature,
        maxTokens: this.config.model.generation?.maxTokens,
        topP: this.config.model.generation?.topP,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        logger.info(`Agent '${this.config.id}' completed run with final textual response`);
        return {
          response: response.content,
        };
      }

      logger.info(
        `Agent '${this.config.id}' requested ${response.toolCalls.length} tool call(s): [${response.toolCalls
          .map((tc) => tc.name)
          .join(", ")}]`,
      );

      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      const plan = await this.orchestrator.plan({
        toolCalls: response.toolCalls,
        context,
      });

      const results = await this.orchestrator.execute(plan, context);

      const resultsByTaskId = new Map(results.map((r) => [r.taskId, r]));

      for (const toolCall of response.toolCalls) {
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

    const errorMessage = `Agent '${this.config.id}' exceeded maximum iterations: ${maxIterations}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
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
