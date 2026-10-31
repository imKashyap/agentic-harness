import { injectable } from "inversify";

import { HarnessError } from "../../errors/harness-error.js";
import { createLogger } from "../../utils/logger.js";
import { InferenceProfile, InferenceProfileSchema } from "./types.js";

const logger = createLogger("InferenceProfileRegistry");

@injectable()
export class InferenceProfileRegistry {
  private readonly profiles = new Map<string, InferenceProfile>();

  register(profile: InferenceProfile): void {
    const validated = InferenceProfileSchema.parse(profile);
    this.profiles.set(validated.id, validated);
    logger.info(`Registered inference profile '${validated.id}' (${validated.name})`);
  }

  get(id: string): InferenceProfile {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new HarnessError(
        `Inference profile '${id}' not found in InferenceProfileRegistry`,
        "PROFILE_NOT_FOUND",
        404,
      );
    }
    return profile;
  }

  has(id: string): boolean {
    return this.profiles.has(id);
  }

  getAll(): InferenceProfile[] {
    return Array.from(this.profiles.values());
  }

  delete(id: string): boolean {
    return this.profiles.delete(id);
  }

  clear(): void {
    this.profiles.clear();
  }
}
