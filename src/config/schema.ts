import { z } from "zod";

export const assertionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("contains"),
    value: z.string(),
    case_sensitive: z.boolean().optional()
  }),
  z.object({
    type: z.literal("not_contains"),
    value: z.string(),
    case_sensitive: z.boolean().optional()
  }),
  z.object({
    type: z.literal("regex"),
    value: z.string().optional(),
    pattern: z.string().optional(),
    flags: z.string().optional()
  }),
  z.object({
    type: z.literal("json_schema"),
    schema: z.record(z.string(), z.unknown())
  }),
  z.object({
    type: z.literal("max_length"),
    value: z.number().int().nonnegative()
  })
]);

export const testCaseSchema = z.object({
  id: z.string().min(1),
  input: z.string(),
  variables: z.record(z.string(), z.string()).optional(),
  assertions: z.array(assertionSchema).min(1)
});

export const providerConfigSchema = z.object({
  type: z.string().min(1).default("mock"),
  model: z.string().optional(),
  temperature: z.number().optional()
}).passthrough();

export const promptdiffConfigSchema = z.object({
  project: z.string().min(1),
  prompts: z.record(z.string().min(1), z.string().min(1)).refine(
    (prompts) => Object.keys(prompts).length > 0,
    "at least one prompt must be configured"
  ),
  provider: providerConfigSchema.default({ type: "mock" }),
  cases: z.array(testCaseSchema).min(1)
});

export type AssertionConfig = z.infer<typeof assertionSchema>;
export type TestCaseConfig = z.infer<typeof testCaseSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type PromptdiffConfig = z.infer<typeof promptdiffConfigSchema>;

export type LoadedConfig = {
  path: string;
  rootDir: string;
  config: PromptdiffConfig;
};
