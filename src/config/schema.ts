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

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("prompt"), file: z.string().min(1) }),
  z.object({
    kind: z.literal("agent"),
    command: z.array(z.string().min(1)).min(1),
    instructions: z.string().min(1).optional(),
    tools: z.array(z.string().min(1)).default([]),
    timeout_ms: z.number().int().positive().default(30_000)
  })
]);

export const promptdiffConfigSchema = z.object({
  project: z.string().min(1),
  prompts: z.record(z.string().min(1), z.string().min(1)).optional(),
  targets: z.record(z.string().min(1), targetSchema).optional(),
  provider: providerConfigSchema.default({ type: "mock" }),
  cases: z.array(testCaseSchema).min(1)
}).superRefine((config, context) => {
  const promptCount = Object.keys(config.prompts ?? {}).length;
  const targetCount = Object.keys(config.targets ?? {}).length;
  if (promptCount + targetCount === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["targets"], message: "configure at least one target (or use the legacy prompts map)" });
  if (promptCount > 0 && targetCount > 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["targets"], message: "use targets or the legacy prompts map, not both" });
});

export type AssertionConfig = z.infer<typeof assertionSchema>;
export type TestCaseConfig = z.infer<typeof testCaseSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type TargetConfig = z.infer<typeof targetSchema>;
export type PromptdiffConfig = z.infer<typeof promptdiffConfigSchema>;

export type LoadedConfig = {
  path: string;
  rootDir: string;
  config: PromptdiffConfig;
};
