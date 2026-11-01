import { PromptProvider } from "../../prompts/prompt-provider.js";
import { createLogger } from "../../utils/logger.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRunInput, AgentRunner, AgentRunResult } from "./agent-runner.js";

const logger = createLogger("Agent");

export class Agent {
  constructor(
    private readonly config: AgentConfig,
    private readonly promptProvider: PromptProvider,
    private readonly runner: AgentRunner,
  ) {}

  get id(): string {
    return this.config.id;
  }

  get tools(): string[] {
    return [...this.config.tools];
  }

  async run(input: AgentRunInput, parentContext?: ExecutionContext): Promise<AgentRunResult> {
    const isDirectRunContext = parentContext?.agentId === this.config.id && parentContext?.runId;
    const runId = isDirectRunContext ? parentContext.runId : crypto.randomUUID();

    const context: ExecutionContext = {
      runId,
      agentId: this.config.id,
      principalId: parentContext?.principalId,
      parentRunId: isDirectRunContext ? parentContext.parentRunId : parentContext?.runId,
      parentAgentId: isDirectRunContext ? parentContext.parentAgentId : parentContext?.agentId,
      metadata: parentContext?.metadata ? { ...parentContext.metadata } : undefined,
    };

    logger.info(
      `Agent '${this.config.id}' starting run (runId: ${runId}${
        parentContext && !isDirectRunContext
          ? `, parentRunId: ${parentContext.runId}, parentAgent: ${parentContext.agentId}`
          : ""
      })`,
    );

    const startTime = Date.now();
    const prompt = await this.promptProvider.getPrompt(this.config.prompt);
    const result = await this.runner.run(input, context, prompt.content);
    const durationMs = Date.now() - startTime;

    logger.info(`Agent '${this.config.id}' finished run in ${durationMs}ms (runId: ${runId})`);
    return result;
  }
}
