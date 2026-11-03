import { z } from "zod";

import type { ToolContext, ToolResult } from "../../src/capabilities/tools/tool.js";

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

const MessageCandidateSchema = z.union([
  z.string(),
  z.number().transform((n) => String(n)),
  z.boolean().transform((b) => String(b)),
  z.record(z.string(), z.unknown()).transform((obj) => {
    const inner =
      obj.conditionSummary ??
      obj.currentCelsius ??
      obj.temperatureCelsius ??
      obj.celsius ??
      obj.summary ??
      obj.value ??
      obj.message ??
      obj.text;
    if (inner !== undefined && inner !== null) return String(inner);
    return JSON.stringify(obj);
  }),
]);

export const CowsayInputSchema = z.preprocess((val) => {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const candidate =
      obj.message ??
      obj.text ??
      obj.content ??
      obj.input ??
      obj.msg ??
      obj.value ??
      obj.data;

    if (candidate !== undefined && candidate !== null) {
      const res = MessageCandidateSchema.safeParse(candidate);
      if (res.success && res.data.trim().length > 0) {
        return res.data.trim();
      }
    }

    const entries = Object.entries(obj);
    if (entries.length === 1 && entries[0] && entries[0][1] !== undefined && entries[0][1] !== null) {
      const res = MessageCandidateSchema.safeParse(entries[0][1]);
      if (res.success && res.data.trim().length > 0) {
        return res.data.trim();
      }
    }

    const direct =
      obj.conditionSummary ?? obj.currentCelsius ?? obj.temperatureCelsius ?? obj.celsius;
    if (direct !== undefined && direct !== null) {
      return String(direct).trim();
    }
  }
  return "";
}, z.string().trim().min(1, "Parameter 'message' is required for cowsay"));

export async function execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
  const parsed = CowsayInputSchema.safeParse(input);
  if (!parsed.success) {
    const errorMessage =
      parsed.error.issues[0]?.message ?? "Parameter 'message' is required for cowsay";
    return {
      success: false,
      output: null,
      error: errorMessage,
    };
  }

  const message = parsed.data;

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
