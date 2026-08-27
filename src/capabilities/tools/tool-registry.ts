import { injectable } from "inversify";

import { Tool } from "./tool.js";

@injectable()
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  public register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  public get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  public list(): Tool[] {
    return Array.from(this.tools.values());
  }

  public has(id: string): boolean {
    return this.tools.has(id);
  }
}
