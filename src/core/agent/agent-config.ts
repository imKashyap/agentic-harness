import { z } from "zod";

export const GenerationConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
});

export const ModelConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),

  generation: GenerationConfigSchema.optional(),
});

export const PromptConfigSchema = z.object({
  id: z.string().min(1),
  version: z.string().optional(),
});

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),

  model: ModelConfigSchema,

  prompt: PromptConfigSchema,

  skills: z.array(z.string()),
  tools: z.array(z.string()),
  subAgents: z.array(z.string()),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;
export type PromptConfig = z.infer<typeof PromptConfigSchema>;
