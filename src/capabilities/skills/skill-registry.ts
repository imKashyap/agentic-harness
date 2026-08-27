import { injectable } from "inversify";

import { Skill } from "./skill.js";

@injectable()
export class SkillRegistry {
  private skills = new Map<string, Skill>();

  public register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  public get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  public list(): Skill[] {
    return Array.from(this.skills.values());
  }

  public has(id: string): boolean {
    return this.skills.has(id);
  }
}
