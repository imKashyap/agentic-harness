import { createLogger } from "../utils/logger.js";
import { Capability } from "./capability.js";
import { CapabilityLoader } from "./capability-loader.js";
import { CapabilityRegistry } from "./capability-registry.js";

const logger = createLogger("CapabilityManager");

export class CapabilityManager {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly loaders: CapabilityLoader[],
  ) {}

  async load(): Promise<void> {
    logger.info(`Starting capability discovery with ${this.loaders.length} loader(s)`);

    let totalLoaded = 0;
    for (const loader of this.loaders) {
      const loaderName = loader.constructor.name;
      logger.debug(`Running loader: ${loaderName}`);

      try {
        const capabilities = await loader.loadAll();
        logger.info(`Loader '${loaderName}' discovered ${capabilities.length} capability(ies)`);

        for (const capability of capabilities) {
          if (!this.registry.has(capability.id)) {
            this.registry.register(capability);
            totalLoaded++;
          } else {
            logger.warn(`Skipping duplicate capability registration: ${capability.id}`);
          }
        }
      } catch (error) {
        logger.error(
          `Error running loader '${loaderName}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    logger.info(`Capability discovery complete. Total registered capabilities: ${totalLoaded}`);
  }

  get(id: string): Capability {
    return this.registry.get(id);
  }

  getAll(): Capability[] {
    return this.registry.getAll();
  }
}
