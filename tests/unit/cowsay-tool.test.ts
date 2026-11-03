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

  it("handles numeric input values such as temperatures", async () => {
    const resultNum = await executeCowsay({ message: 28 }, mockContext);
    assert.equal(resultNum.success, true);
    assert.ok(String(resultNum.output).includes("< 28 >"));

    const resultZero = await executeCowsay({ message: 0 }, mockContext);
    assert.equal(resultZero.success, true);
    assert.ok(String(resultZero.output).includes("< 0 >"));
  });

  it("handles alternative property aliases like text, content, or raw strings", async () => {
    const textResult = await executeCowsay({ text: "Hello text" }, mockContext);
    assert.equal(textResult.success, true);
    assert.ok(String(textResult.output).includes("< Hello text >"));

    const rawStringResult = await executeCowsay("Raw cow message", mockContext);
    assert.equal(rawStringResult.success, true);
    assert.ok(String(rawStringResult.output).includes("< Raw cow message >"));
  });

  it("extracts temperature/celsius or summary from object inputs", async () => {
    const objResult = await executeCowsay(
      { message: { currentCelsius: 28 } },
      mockContext,
    );
    assert.equal(objResult.success, true);
    assert.ok(String(objResult.output).includes("< 28 >"));
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
