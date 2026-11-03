export type CapabilityType = "skill" | "tool" | "agent";

export interface Capability {
  id: string;
  name: string;
  description: string;
  type: CapabilityType;

  outputSchema?: Record<string, unknown>;

  metadata?: Record<string, unknown>;
}
