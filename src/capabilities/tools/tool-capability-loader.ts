import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createLogger } from "../../utils/logger.js";
import { Tool, ToolContext, ToolResult } from "./tool.js";

const logger = createLogger("ToolCapabilityLoader");

export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiresApproval?: boolean;
  progressMessage?: string;
  timeoutMs?: number;
  retryPolicy?: Tool["retryPolicy"];
  handler?: string;
}

export class ToolCapabilityLoader {
  private readonly cache = new Map<string, Tool>();

  constructor(
    private readonly toolsDir: string = "./tools",
    initialTools: Tool[] = [],
  ) {
    for (const tool of initialTools) {
      this.cache.set(tool.id, tool);
    }
  }

  /**
   * Register an in-memory tool into the loader's cache.
   */
  registerInMemoryTool(tool: Tool): void {
    this.cache.set(tool.id, tool);
  }

  /**
   * Load a tool by ID or name with caching to avoid duplicate disk reads.
   */
  async load(toolIdOrName: string): Promise<Tool | null> {
    const rawName = toolIdOrName.replace(/^tool\./, "");
    const toolId = `tool.${rawName}`;

    // Return cached tool if already loaded
    if (this.cache.has(toolId)) {
      logger.debug(`Tool '${toolId}' returned from cache (shared capability)`);
      return this.cache.get(toolId)!;
    }

    // Try resolving directory by rawName first, then by toolId
    let toolDir = resolve(join(this.toolsDir, rawName));
    let dirExists = await this.directoryExists(toolDir);
    if (!dirExists) {
      toolDir = resolve(join(this.toolsDir, toolId));
      dirExists = await this.directoryExists(toolDir);
    }

    if (!dirExists) {
      logger.warn(`Tool directory not found for '${toolIdOrName}' in '${this.toolsDir}'`);
      return null;
    }

    const configPath = join(toolDir, "tool.json");
    let metadata: ToolMetadata;
    try {
      const content = await readFile(configPath, "utf-8");
      metadata = JSON.parse(content) as ToolMetadata;
    } catch (error) {
      logger.warn(
        `Failed to read tool.json for '${toolId}' at '${configPath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    // Resolve handler file
    const handlerPath = await this.resolveHandlerPath(toolDir, metadata.handler);
    if (!handlerPath) {
      logger.warn(`No executable handler found for tool '${toolId}' in '${toolDir}'`);
      return null;
    }

    try {
      const fileUrl = pathToFileURL(handlerPath).href;
      const mod = await import(fileUrl);
      const executeFn = mod.execute ?? mod.handler ?? mod.default;

      if (typeof executeFn !== "function") {
        logger.error(`Handler at '${handlerPath}' does not export an execute function`);
        return null;
      }

      const tool: Tool = {
        id: toolId,
        name: metadata.name ?? rawName,
        description: metadata.description ?? "",
        type: "tool",
        inputSchema: metadata.inputSchema ?? { type: "object", properties: {} },
        outputSchema: metadata.outputSchema,
        requiresApproval: metadata.requiresApproval,
        progressMessage: metadata.progressMessage,
        timeoutMs: metadata.timeoutMs,
        retryPolicy: metadata.retryPolicy,
        execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
          return executeFn(input, context);
        },
      };

      this.cache.set(toolId, tool);
      logger.info(`Loaded tool capability '${toolId}' (${tool.name}) from '${toolDir}'`);
      return tool;
    } catch (error) {
      logger.error(
        `Failed to import tool handler for '${toolId}' from '${handlerPath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Discover and load all tools found in the tools directory.
   */
  async loadAll(): Promise<Tool[]> {
    logger.debug(`Scanning for all tools in '${this.toolsDir}'`);
    let entries;
    try {
      entries = await readdir(this.toolsDir, { withFileTypes: true });
    } catch (error) {
      logger.debug(
        `Tools directory not accessible at '${this.toolsDir}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return Array.from(this.cache.values());
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.load(entry.name);
      }
    }

    return Array.from(this.cache.values());
  }

  getCached(toolId: string): Tool | undefined {
    const normalized = toolId.startsWith("tool.") ? toolId : `tool.${toolId}`;
    return this.cache.get(normalized);
  }

  getAllCached(): Tool[] {
    return Array.from(this.cache.values());
  }

  private async directoryExists(path: string): Promise<boolean> {
    try {
      const s = await stat(path);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  private async resolveHandlerPath(
    toolDir: string,
    configuredHandler?: string,
  ): Promise<string | null> {
    if (configuredHandler) {
      const candidate = join(toolDir, configuredHandler);
      try {
        const s = await stat(candidate);
        if (s.isFile()) return candidate;
      } catch {
        // try alternatives if configured name not directly found
      }
    }

    const defaultCandidates = ["handler.ts", "handler.js", "index.ts", "index.js"];

    for (const candidate of defaultCandidates) {
      const fullPath = join(toolDir, candidate);
      try {
        const s = await stat(fullPath);
        if (s.isFile()) return fullPath;
      } catch {
        // continue search
      }
    }

    return null;
  }
}
