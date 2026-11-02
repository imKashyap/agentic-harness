import type { ToolContext, ToolResult } from "../../src/capabilities/tools/tool.js";

interface CowsayInput {
  message: string;
}

const MAX_LINE_WIDTH = 40;
const COW = [
  "        \\   ^__^",
  "         \\  (oo)\\_______",
  "            (__)\\       )\\/\\",
  "                ||----w |",
  "                ||     ||",
].join("\n");

function wrapMessage(message: string): string[] {
  const lines: string[] = [];

  for (const paragraph of message.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";

    for (const word of words) {
      if (line && line.length + word.length + 1 <= MAX_LINE_WIDTH) {
        line += ` ${word}`;
        continue;
      }

      if (line) lines.push(line);

      let remainingWord = word;
      while (remainingWord.length > MAX_LINE_WIDTH) {
        lines.push(remainingWord.slice(0, MAX_LINE_WIDTH));
        remainingWord = remainingWord.slice(MAX_LINE_WIDTH);
      }
      line = remainingWord;
    }

    if (line) lines.push(line);
  }

  return lines;
}

export async function execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
  const req = typeof input === "object" && input !== null ? (input as Partial<CowsayInput>) : {};
  const message = typeof req.message === "string" ? req.message.trim() : "";

  if (!message) {
    return {
      success: false,
      output: null,
      error: "Parameter 'message' is required for cowsay",
    };
  }

  const lines = wrapMessage(message);
  const width = Math.max(...lines.map((line) => line.length));
  const top = ` ${"_".repeat(width + 2)}`;
  const bottom = ` ${"-".repeat(width + 2)}`;
  let speechBubble: string;

  if (lines.length === 1) {
    speechBubble = `${top}\n< ${lines[0]} >\n${bottom}`;
  } else {
    speechBubble = [
      top,
      ...lines.map((line, index) => {
        const content = ` ${line.padEnd(width)} `;
        if (index === 0) return `/${content}\\`;
        if (index === lines.length - 1) return `\\${content}/`;
        return `|${content}|`;
      }),
      bottom,
    ].join("\n");
  }

  return {
    success: true,
    output: `${speechBubble}\n${COW}`,
  };
}
