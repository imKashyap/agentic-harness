import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createLogger } from "../../utils/logger.js";
import { Skill } from "./skill.js";
import { SkillMetadata } from "./skill-metadata.js";

const logger = createLogger("SkillCapabilityLoader");

export class SkillCapabilityLoader {
  private readonly cache = new Map<string, Skill>();

  constructor(private readonly skillsDir: string = "./skills") {}

  /**
   * Load a skill by ID or name with caching to avoid duplicate disk reads.
   */
  async load(skillIdOrName: string): Promise<Skill | null> {
    const rawName = skillIdOrName.replace(/^skill\./, "");
    const skillId = `skill.${rawName}`;

    // Return cached skill if already loaded
    if (this.cache.has(skillId)) {
      logger.debug(`Skill '${skillId}' returned from cache (shared capability)`);
      return this.cache.get(skillId)!;
    }

    // Try resolving directory by rawName first, then by skillId
    let skillDir = resolve(join(this.skillsDir, rawName));
    let dirExists = await this.directoryExists(skillDir);
    if (!dirExists) {
      skillDir = resolve(join(this.skillsDir, skillId));
      dirExists = await this.directoryExists(skillDir);
    }

    if (!dirExists) {
      logger.warn(`Skill directory not found for '${skillIdOrName}' in '${this.skillsDir}'`);
      return null;
    }

    const metadataPath = join(skillDir, "metadata.json");
    const contentPath = join(skillDir, "SKILL.md");

    try {
      const metadataContent = await readFile(metadataPath, "utf-8");
      const metadata = JSON.parse(metadataContent) as SkillMetadata;
      const content = await readFile(contentPath, "utf-8");

      const finalId = metadata.id ?? skillId;

      const skill: Skill = {
        id: finalId,
        name: metadata.name,
        description: metadata.description,
        type: "skill",
        content,
      };

      this.cache.set(finalId, skill);
      if (finalId !== skillId) {
        this.cache.set(skillId, skill);
      }

      logger.info(`Loaded skill capability '${finalId}' (${skill.name}) from '${skillDir}'`);
      return skill;
    } catch (error) {
      logger.warn(
        `Failed to load skill at '${skillDir}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Discover and load all skills found in the skills directory.
   */
  async loadAll(): Promise<Skill[]> {
    logger.debug(`Scanning for all skills in '${this.skillsDir}'`);
    let entries;
    try {
      entries = await readdir(this.skillsDir, { withFileTypes: true });
    } catch (error) {
      logger.debug(
        `Skills directory not accessible at '${this.skillsDir}': ${
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

  getCached(skillId: string): Skill | undefined {
    const normalized = skillId.startsWith("skill.") ? skillId : `skill.${skillId}`;
    return this.cache.get(normalized);
  }

  getAllCached(): Skill[] {
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
}
