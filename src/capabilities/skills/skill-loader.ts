import { CapabilityLoaderInterface } from "../capability-loader.js";
import { Skill } from "./skill.js";
import { SkillCapabilityLoader } from "./skill-capability-loader.js";

export class SkillLoader implements CapabilityLoaderInterface {
  private readonly loader: SkillCapabilityLoader;

  constructor(skillsPath: string) {
    this.loader = new SkillCapabilityLoader(skillsPath);
  }

  async loadAll(): Promise<Skill[]> {
    return this.loader.loadAll();
  }
}
