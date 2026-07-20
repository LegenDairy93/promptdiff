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
  }),
  // --- trace assertions: require an agent target; fail loudly against a prompt target ---
  z.object({
    type: z.literal("tool_called"),
    name: z.string().min(1),
    min_times: z.number().int().positive().optional(),
    max_times: z.number().int().nonnegative().optional(),
    args: z.record(z.string(), z.unknown()).optional()
  }),
  z.object({
    type: z.literal("tool_not_called"),
    name: z.string().min(1)
  }),
  z.object({
    type: z.literal("tool_args_match"),
    name: z.string().min(1),
    args: z.record(z.string(), z.unknown()).optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    match: z.enum(["any", "all"]).default("any")
  }),
  z.object({
    type: z.literal("no_undeclared_tools")
  }),
  z.object({
    type: z.literal("max_steps"),
    value: z.number().int().nonnegative(),
    step_type: z.enum(["all", "tool", "model"]).default("all")
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

/**
 * A tool the agent may call. Accepts a bare string (`- search`) or a full object.
 * z.preprocess (not z.union) so downstream code sees one object type, never a union.
 */
export const toolDeclarationSchema = z.preprocess(
  (value) => (typeof value === "string" ? { name: value } : value),
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    args_schema: z.record(z.string(), z.unknown()).optional(),
    effect: z.enum(["read", "write", "external"]).optional()
  })
);

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("prompt"), file: z.string().min(1) }),
  z.object({
    kind: z.literal("agent"),
    command: z.array(z.string().min(1)).min(1),
    instructions: z.string().min(1).optional(),
    tools: z.array(toolDeclarationSchema).default([])
      .refine((tools) => new Set(tools.map((tool) => tool.name)).size === tools.length, {
        message: "duplicate tool names are not allowed"
      }),
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
  // Cross-field assertion checks live here: discriminatedUnion members must be ZodObject, so they cannot carry .superRefine.
  config.cases.forEach((testCase, caseIndex) => {
    testCase.assertions.forEach((assertion, assertionIndex) => {
      if (assertion.type !== "tool_args_match") return;
      if (assertion.args || assertion.schema) return;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cases", caseIndex, "assertions", assertionIndex],
        message: "tool_args_match requires args or schema"
      });
    });
  });
});

export type AssertionConfig = z.infer<typeof assertionSchema>;
export type ToolDeclaration = z.infer<typeof toolDeclarationSchema>;
export type TestCaseConfig = z.infer<typeof testCaseSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type TargetConfig = z.infer<typeof targetSchema>;
export type PromptdiffConfig = z.infer<typeof promptdiffConfigSchema>;

export type LoadedConfig = {
  path: string;
  rootDir: string;
  config: PromptdiffConfig;
};
