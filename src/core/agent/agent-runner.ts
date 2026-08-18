import { CapabilityRegistry } from "../../capabilities/capability-registry.js";
import { CapabilityExecutor } from "../../capabilities/execution/capability-executor.js";
import { AgentDefinition, LLM, Message, ToolDefinition } from "../../llm/model.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { AgentConfig } from "./agent-config.js";

export interface AgentRunInput {
  message: string;
}

export interface AgentRunResult {
  response: string;
}

export class AgentRunner {
  constructor(
    private readonly config: AgentConfig,
    private readonly llm: LLM,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly capabilityExecutor: CapabilityExecutor,
  ) {}

  async run(
    input: AgentRunInput,
    context: ExecutionContext,
    systemPrompt: string,
  ): Promise<AgentRunResult> {
    const messages: Message[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: input.message,
      },
    ];

    const maxIterations = 10;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.llm.chat({
        messages,
        tools: this.getToolDefinitions(),
        agents: this.getAgentDefinitions(),
        model: this.config.model.model,

        temperature: this.config.model.generation?.temperature,

        maxTokens: this.config.model.generation?.maxTokens,

        topP: this.config.model.generation?.topP,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return {
          response: response.content,
        };
      }

      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        const result = await this.capabilityExecutor.execute(
          {
            name: toolCall.name,
            input: toolCall.arguments,
          },
          context,
        );

        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify(result.output),
        });
      }
    }

    throw new Error(`Agent exceeded maximum iterations: 10`);
  }

  private getToolDefinitions(): ToolDefinition[] {
    return this.capabilityRegistry.getByType("tool").map((capability) => {
      const tool = this.capabilityRegistry.getTool(capability.id);

      return {
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
    });
  }

  private getAgentDefinitions(): AgentDefinition[] {
    return this.capabilityRegistry
      .getByType("agent")
      .filter((capability) => capability.id !== `agent.${this.config.id}`)
      .map((capability) => ({
        name: capability.id,
        description: capability.description,

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
