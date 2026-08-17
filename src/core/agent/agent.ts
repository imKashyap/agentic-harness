import { AgentRunInput, AgentRunner, AgentRunResult } from "./agent-runner.js";

import { PromptProvider } from "../../prompts/prompt-provider.js";
import { ExecutionContext } from "../execution/execution-context.js";
import { AgentConfig } from "./agent-config.js";

export class Agent {
  constructor(
    private readonly config: AgentConfig,
    private readonly promptProvider: PromptProvider,
    private readonly runner: AgentRunner,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const prompt = await this.promptProvider.getPrompt(this.config.prompt);

    const context: ExecutionContext = {
      runId: crypto.randomUUID(),
      agentId: this.config.id,
    };

    return this.runner.run(input, context, prompt.content);
  }
}
