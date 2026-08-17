import { Capability } from "./capability.js";

export interface CapabilityLoader {
  loadAll(): Promise<Capability[]>;
}
