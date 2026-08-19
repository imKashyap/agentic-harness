import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createLogger } from "../utils/logger.js";
import { Prompt, PromptProvider, PromptRequest } from "./prompt-provider.js";

const logger = createLogger("FilePromptProvider");

export class FilePromptProvider implements PromptProvider {
  constructor(private readonly basePath: string) {}

  async getPrompt(request: PromptRequest): Promise<Prompt> {
    const version = request.version ?? "v1";
    const filePath = join(this.basePath, `${request.id}.md`);
    logger.debug(`Loading prompt '${request.id}' from: ${filePath}`);

    try {
      const content = await readFile(filePath, "utf-8");
      logger.info(`Loaded prompt '${request.id}' (${version}) from ${filePath}`);
      return {
        id: request.id,
        version,
        content,
      };
    } catch (error) {
      const errorMessage = `Prompt file not found for '${request.id}' at '${filePath}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
}
