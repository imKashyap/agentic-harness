import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ToolContext } from "../../src/capabilities/tools/tool.js";
import { execute as executeCowsay } from "../../tools/cowsay/handler.js";

const mockContext: ToolContext = {
  runId: "test-run-123",
  agentId: "supervisor",
};

describe("cowsay tool", () => {
  it("renders a single-line message above an ASCII cow", async () => {
    const result = await executeCowsay({ message: "Hello, world!" }, mockContext);

    assert.equal(result.success, true);
    assert.equal(
      result.output,
      [
        " _______________",
        "< Hello, world! >",
        " ---------------",
        "        \\   ^__^",
        "         \\  (oo)\\_______",
        "            (__)\\       )\\/\\",
        "                ||----w |",
        "                ||     ||",
      ].join("\n"),
    );
  });

  it("wraps long messages into a multi-line speech bubble", async () => {
    const result = await executeCowsay(
      { message: "The cow says hello and hopes you have a wonderful day." },
      mockContext,
    );

    assert.equal(result.success, true);
    assert.equal(
      result.output,
      [
        " _________________________________________",
        "/ The cow says hello and hopes you have a \\",
        "\\ wonderful day.                          /",
        " -----------------------------------------",
        "        \\   ^__^",
        "         \\  (oo)\\_______",
        "            (__)\\       )\\/\\",
        "                ||----w |",
        "                ||     ||",
      ].join("\n"),
    );
  });

  it("returns an error when the message is missing or blank", async () => {
    const missing = await executeCowsay({}, mockContext);
    const blank = await executeCowsay({ message: "  " }, mockContext);

    assert.equal(missing.success, false);
    assert.match(missing.error ?? "", /message/);
    assert.equal(blank.success, false);
    assert.match(blank.error ?? "", /message/);
  });
});
