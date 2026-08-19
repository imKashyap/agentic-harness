import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createLogger } from "../../utils/logger.js";
import { CapabilityLoader } from "../capability-loader.js";
import { Skill } from "./skill.js";

const logger = createLogger("SkillLoader");

interface SkillMetadata {
  id: string;
  name: string;
  description: string;
}

export class SkillLoader implements CapabilityLoader {
  constructor(private readonly skillsPath: string) {}

  async loadAll(): Promise<Skill[]> {
    logger.debug(`Scanning for skills in: ${this.skillsPath}`);

    let entries;
    try {
      entries = await readdir(this.skillsPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `Skills directory not accessible at '${this.skillsPath}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }

    const skills: Skill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillPath = join(this.skillsPath, entry.name);
      const metadataPath = join(skillPath, "metadata.json");
      const contentPath = join(skillPath, "SKILL.md");

      try {
        const metadataContent = await readFile(metadataPath, "utf-8");
        const metadata = JSON.parse(metadataContent) as SkillMetadata;
        const content = await readFile(contentPath, "utf-8");

        const skillId = metadata.id ?? `skill.${entry.name}`;

        skills.push({
          id: skillId,
          name: metadata.name,
          description: metadata.description,
          type: "skill",
          content,
        });

        logger.debug(`Loaded skill '${skillId}' from ${skillPath}`);
      } catch (error) {
        logger.warn(
          `Skipping skill directory '${entry.name}' due to error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    logger.info(`Loaded ${skills.length} skill(s) from '${this.skillsPath}'`);
    return skills;
  }
}
