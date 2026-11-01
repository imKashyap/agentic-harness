import { MemoryManager } from "../../../memory/long-term/memory-manager.js";
import { Tool } from "../tool.js";
import { RememberFactTool } from "./memory/remember-tool.js";
import { SearchMemoryTool } from "./memory/search-memory-tool.js";

export * from "./memory/remember-tool.js";
export * from "./memory/search-memory-tool.js";

/**
 * Creates all standard built-in tools bound to the provided memory manager.
 */
export function createBuiltinTools(memoryManager: MemoryManager): Tool[] {
  return [new RememberFactTool(memoryManager), new SearchMemoryTool(memoryManager)];
}
