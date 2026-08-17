import { CapabilityLoader } from "../capability-loader.js";
import { Tool } from "./tool.js";

export class ToolLoader implements CapabilityLoader {
  async loadAll(): Promise<Tool[]> {
    return [];
  }
}
