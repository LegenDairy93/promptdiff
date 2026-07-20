import type { AssertionConfig, ToolDeclaration } from "../config/schema.js";
import type { AgentTraceStep, ToolViolation } from "../artifacts/types.js";

/** Everything an assertion may inspect. Output-only assertions ignore all but `output`. */
export type AssertionContext = {
  output: string;
  trace?: AgentTraceStep[];
  violations?: ToolViolation[];
  declaredTools?: ToolDeclaration[];
};

export type AssertionResult = {
  type: AssertionConfig["type"];
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
};
