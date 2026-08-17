import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
    Prompt,
    PromptProvider,
    PromptRequest,
} from "./prompt-provider.js";

export class FilePromptProvider implements PromptProvider {
    constructor(
        private readonly basePath: string,
    ) { }

    async getPrompt(request: PromptRequest): Promise<Prompt> {
        const version = request.version ?? "v1";

        const filePath = join(
            this.basePath,
            `${request.id}.md`,
        );

        const content = await readFile(filePath, "utf-8");

        return {
            id: request.id,
            version,
            content,
        };
    }
}
