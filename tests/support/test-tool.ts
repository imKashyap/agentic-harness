import type { Tool } from "../../src/capabilities/tools/tool.js";

/** Generic test fixture for registry and execution tests. */
export class TestTool implements Tool {
  readonly id = "tool.test";
  readonly name = "Test Tool";
  readonly description = "A generic tool used only in tests";
  readonly type = "tool" as const;
  readonly metadata = {};
  readonly inputSchema = { type: "object" };

  async execute(input: unknown) {
    return { success: true, output: input };
  }
}
