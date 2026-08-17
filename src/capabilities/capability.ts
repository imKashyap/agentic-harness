export type CapabilityType = "skill" | "tool" | "agent";

export interface Capability {
  id: string;
  name: string;
  description: string;
  type: CapabilityType;

  metadata?: Record<string, unknown>;
}
