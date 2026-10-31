import { z } from "zod";

export type ProviderType = "openrouter" | "openai" | "anthropic" | "mock" | "openai-compatible";

export const InferenceParametersSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  stop: z.array(z.string()).optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  additionalParams: z.record(z.string(), z.unknown()).optional(),
});

export type InferenceParameters = z.infer<typeof InferenceParametersSchema>;

export const ModelCapabilitiesSchema = z.object({
  supportsTemperature: z.boolean().default(true),
  supportsTopP: z.boolean().default(true),
  supportsFrequencyPenalty: z.boolean().default(true),
  supportsPresencePenalty: z.boolean().default(true),
  supportsStreaming: z.boolean().default(true),
  supportsTools: z.boolean().default(true),
  tokenParamName: z.enum(["max_tokens", "max_completion_tokens"]).default("max_tokens"),
  allowedParameters: z.array(z.string()).optional(),
  customMappers: z.record(z.string(), z.string()).optional(),
});

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  supportsTemperature: true,
  supportsTopP: true,
  supportsFrequencyPenalty: true,
  supportsPresencePenalty: true,
  supportsStreaming: true,
  supportsTools: true,
  tokenParamName: "max_tokens",
};

export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerType: z.enum(["openrouter", "openai", "anthropic", "mock", "openai-compatible"]),
  baseURL: z.string().url().or(z.literal("")),
  apiKeyEnv: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  defaultHeaders: z.record(z.string(), z.string()).optional(),
  defaultGeneration: InferenceParametersSchema.optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ModelDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  contextLength: z.number().int().positive().optional(),
  capabilities: ModelCapabilitiesSchema.default(DEFAULT_MODEL_CAPABILITIES),
  defaultGeneration: InferenceParametersSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>;

export const InferenceProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parameters: InferenceParametersSchema,
  providerOverrides: z.record(z.string(), InferenceParametersSchema).optional(),
  modelOverrides: z.record(z.string(), InferenceParametersSchema).optional(),
});

export type InferenceProfile = z.infer<typeof InferenceProfileSchema>;

export const AgentModelConfigSchema = z.object({
  agentId: z.string().min(1),
  modelId: z.string().min(1),
  inferenceProfileId: z.string().min(1),
  overrides: InferenceParametersSchema.optional(),
});

export type AgentModelConfig = z.infer<typeof AgentModelConfigSchema>;

export interface ResolvedModelConfig {
  agentId: string;
  providerId: string;
  providerType: ProviderType;
  baseURL: string;
  apiKeyEnv: string;
  apiKey: string;
  providerModelId: string;
  parameters: InferenceParameters;
  capabilities: ModelCapabilities;
  contextLength?: number;
  configVersion: number;
  resolvedAt: number;
}
