import { Capability } from "../capability.js";

export interface Skill extends Capability {
  type: "skill";

  content: string;
}
