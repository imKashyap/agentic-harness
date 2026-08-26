import { HarnessError } from "./harness-error.js";

export class CapabilityNotFoundError extends HarnessError {
  constructor(public readonly capabilityId: string) {
    super(`Capability not found: ${capabilityId}`, "CAPABILITY_NOT_FOUND", 404, { capabilityId });
  }
}

export class CapabilityAlreadyRegisteredError extends HarnessError {
  constructor(public readonly capabilityId: string) {
    super(`Capability already registered: ${capabilityId}`, "CAPABILITY_ALREADY_REGISTERED", 409, {
      capabilityId,
    });
  }
}

export class CapabilityTypeError extends HarnessError {
  constructor(
    public readonly capabilityId: string,
    public readonly expectedType: string,
    public readonly actualType: string,
  ) {
    const article = /^[aeiou]/i.test(expectedType) ? "an" : "a";
    super(
      `Capability '${capabilityId}' is not ${article} ${expectedType} (actual: ${actualType})`,
      "CAPABILITY_TYPE_MISMATCH",
      400,
      { capabilityId, expectedType, actualType },
    );
  }
}
