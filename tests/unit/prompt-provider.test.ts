import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FilePromptProvider } from "../../src/prompts/file-prompt-provider.js";

describe("FilePromptProvider", () => {
  it("loads an existing prompt file", async () => {
    const provider = new FilePromptProvider("./prompts/agents");
    const prompt = await provider.getPrompt({ id: "supervisor" });

    assert.strictEqual(prompt.id, "supervisor");
    assert.match(prompt.content, /Supervisor Agent/);
    assert.match(prompt.content, /use the tools and sub-agents you have been provided with/);
  });

  it("throws an error in absence of a prompt file for an agent", async () => {
    const provider = new FilePromptProvider("./prompts/agents");
    await assert.rejects(
      async () => {
        await provider.getPrompt({ id: "nonexistent-agent" });
      },
      {
        message: /Prompt file not found for 'nonexistent-agent'/,
      },
    );
  });
});
