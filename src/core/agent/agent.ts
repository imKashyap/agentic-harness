import { PromptProvider } from "../../prompts/prompt-provider.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { AgentConfig } from "./agent-config.js";
import { AgentRunInput, AgentRunner, AgentRunResult } from "./agent-runner.js";

export class Agent {
  constructor(
    private readonly config: AgentConfig,
    private readonly promptProvider: PromptProvider,
    private readonly runner: AgentRunner,
  ) {}

  get id(): string {
    return this.config.id;
  }

  async run(input: AgentRunInput, parentContext?: ExecutionContext): Promise<AgentRunResult> {
    const prompt = await this.promptProvider.getPrompt(this.config.prompt);

    const context: ExecutionContext = {
      runId: crypto.randomUUID(),
      agentId: this.config.id,

      parentRunId: parentContext?.runId,

      parentAgentId: parentContext?.agentId,
    };

    return this.runner.run(input, context, prompt.content);
  }
}
