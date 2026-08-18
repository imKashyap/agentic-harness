import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { CapabilityLoader } from "../capability-loader.js";
import { Skill } from "./skill.js";

interface SkillMetadata {
  id: string;
  name: string;
  description: string;
}

export class SkillLoader implements CapabilityLoader {
  constructor(private readonly skillsPath: string) {}

  async loadAll(): Promise<Skill[]> {
    const entries = await readdir(this.skillsPath, { withFileTypes: true });

    const skills: Skill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillPath = join(this.skillsPath, entry.name);

      const metadataPath = join(skillPath, "metadata.json");

      const contentPath = join(skillPath, "SKILL.md");

      const metadataContent = await readFile(metadataPath, "utf-8");

      const metadata = JSON.parse(metadataContent) as SkillMetadata;

      const content = await readFile(contentPath, "utf-8");

      skills.push({
        id: metadata.id,
        name: metadata.name,
        description: metadata.description,
        type: "skill",
        content,
      });
    }

    return skills;
  }
}
