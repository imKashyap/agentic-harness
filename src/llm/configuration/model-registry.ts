import { injectable } from "inversify";

import { HarnessError } from "../../errors/harness-error.js";
import { createLogger } from "../../utils/logger.js";
import { ModelDefinition, ModelDefinitionSchema } from "./types.js";

const logger = createLogger("ModelRegistry");

@injectable()
export class ModelRegistry {
  private readonly models = new Map<string, ModelDefinition>();

  register(model: ModelDefinition): void {
    const validated = ModelDefinitionSchema.parse(model);
    this.models.set(validated.id, validated);
    logger.info(
      `Registered model '${validated.id}' (name: ${validated.name}, providerId: ${validated.providerId}, modelId: ${validated.modelId})`,
    );
  }

  get(id: string): ModelDefinition {
    const model = this.models.get(id);
    if (!model) {
      throw new HarnessError(`Model '${id}' not found in ModelRegistry`, "MODEL_NOT_FOUND", 404);
    }
    return model;
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  getByProvider(providerId: string): ModelDefinition[] {
    return Array.from(this.models.values()).filter((m) => m.providerId === providerId);
  }

  getAll(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  delete(id: string): boolean {
    return this.models.delete(id);
  }

  clear(): void {
    this.models.clear();
  }
}
