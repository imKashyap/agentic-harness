import { Capability } from "../capability.js";
import { CapabilityLoader } from "../capability-loader.js";

export class FileCapabilityLoader implements CapabilityLoader {
  async loadAll(): Promise<Capability[]> {
    return [];
  }
}
