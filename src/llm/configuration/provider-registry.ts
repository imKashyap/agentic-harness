import { injectable } from "inversify";

import { HarnessError } from "../../errors/harness-error.js";
import { createLogger } from "../../utils/logger.js";
import { ProviderConfig, ProviderConfigSchema } from "./types.js";

const logger = createLogger("ProviderRegistry");

@injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderConfig>();

  register(config: ProviderConfig): void {
    const validated = ProviderConfigSchema.parse(config);
    this.providers.set(validated.id, validated);
    logger.info(
      `Registered provider '${validated.id}' (${validated.name}, type: ${validated.providerType})`,
    );
  }

  get(id: string): ProviderConfig {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new HarnessError(
        `Provider '${id}' not found in ProviderRegistry`,
        "PROVIDER_NOT_FOUND",
        404,
      );
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  getAll(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  delete(id: string): boolean {
    return this.providers.delete(id);
  }

  clear(): void {
    this.providers.clear();
  }
}
