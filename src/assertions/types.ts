import type { AssertionConfig } from "../config/schema.js";

export type AssertionResult = {
  type: AssertionConfig["type"];
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
};
