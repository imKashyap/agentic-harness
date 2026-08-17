import { Capability } from "./capability.js";
import { CapabilityLoader } from "./capability-loader.js";
import { CapabilityRegistry } from "./capability-registry.js";

export class CapabilityManager {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly loaders: CapabilityLoader[],
  ) {}

  async load(): Promise<void> {
    for (const loader of this.loaders) {
      const capabilities = await loader.loadAll();

      for (const capability of capabilities) {
        this.registry.register(capability);
      }
    }
  }

  get(id: string): Capability {
    return this.registry.get(id);
  }

  getAll(): Capability[] {
    return this.registry.getAll();
  }
}
