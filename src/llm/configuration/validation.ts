import { HarnessError } from "../../errors/harness-error.js";
import { InferenceParameters, ModelCapabilities } from "./types.js";

export class ConfigValidationError extends HarnessError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIG_VALIDATION_ERROR", 400, details);
  }
}

export function validateCapabilities(
  parameters: InferenceParameters,
  capabilities: ModelCapabilities,
  contextInfo: { modelId?: string; agentId?: string } = {},
): void {
  const context = `[Model: ${contextInfo.modelId ?? "unknown"}, Agent: ${contextInfo.agentId ?? "unknown"}]`;

  if (capabilities.supportsTemperature === false && parameters.temperature !== undefined) {
    throw new ConfigValidationError(`${context} Model does not support 'temperature' parameter.`, {
      parameter: "temperature",
      value: parameters.temperature,
    });
  }

  if (capabilities.supportsTopP === false && parameters.topP !== undefined) {
    throw new ConfigValidationError(`${context} Model does not support 'topP' parameter.`, {
      parameter: "topP",
      value: parameters.topP,
    });
  }

  if (
    capabilities.supportsFrequencyPenalty === false &&
    parameters.frequencyPenalty !== undefined
  ) {
    throw new ConfigValidationError(
      `${context} Model does not support 'frequencyPenalty' parameter.`,
      { parameter: "frequencyPenalty", value: parameters.frequencyPenalty },
    );
  }

  if (capabilities.supportsPresencePenalty === false && parameters.presencePenalty !== undefined) {
    throw new ConfigValidationError(
      `${context} Model does not support 'presencePenalty' parameter.`,
      { parameter: "presencePenalty", value: parameters.presencePenalty },
    );
  }

  if (capabilities.allowedParameters && capabilities.allowedParameters.length > 0) {
    const allowed = new Set(capabilities.allowedParameters);
    const providedKeys = Object.keys(parameters).filter(
      (k) => (parameters as Record<string, unknown>)[k] !== undefined,
    );

    for (const key of providedKeys) {
      if (key === "additionalParams") continue;
      if (!allowed.has(key)) {
        throw new ConfigValidationError(
          `${context} Parameter '${key}' is not in the model's allowed parameter list: [${capabilities.allowedParameters.join(
            ", ",
          )}]`,
          { parameter: key },
        );
      }
    }
  }
}

export function mapInferenceParameters(
  parameters: InferenceParameters,
  capabilities: ModelCapabilities,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (parameters.temperature !== undefined && capabilities.supportsTemperature !== false) {
    payload["temperature"] = parameters.temperature;
  }

  if (parameters.maxTokens !== undefined) {
    const tokenField = capabilities.tokenParamName ?? "max_tokens";
    payload[tokenField] = parameters.maxTokens;
  }

  if (parameters.topP !== undefined && capabilities.supportsTopP !== false) {
    payload["top_p"] = parameters.topP;
  }

  if (
    parameters.frequencyPenalty !== undefined &&
    capabilities.supportsFrequencyPenalty !== false
  ) {
    payload["frequency_penalty"] = parameters.frequencyPenalty;
  }

  if (parameters.presencePenalty !== undefined && capabilities.supportsPresencePenalty !== false) {
    payload["presence_penalty"] = parameters.presencePenalty;
  }

  if (parameters.stop !== undefined && parameters.stop.length > 0) {
    payload["stop"] = parameters.stop;
  }

  if (parameters.reasoningEffort !== undefined) {
    payload["reasoning_effort"] = parameters.reasoningEffort;
  }

  if (parameters.additionalParams) {
    for (const [key, val] of Object.entries(parameters.additionalParams)) {
      const mappedKey = capabilities.customMappers?.[key] ?? key;
      payload[mappedKey] = val;
    }
  }

  return payload;
}
