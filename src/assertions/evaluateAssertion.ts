import type { AssertionConfig } from "../config/schema.js";
import type { AssertionContext, AssertionResult } from "./types.js";
import { validateAgainstSchema } from "./ajv.js";
import { evaluateTraceAssertion } from "./evaluateTraceAssertion.js";

/** Accepts a bare output string (v0.1 form) or a full context. Trace assertions need the context. */
export function evaluateAssertion(assertion: AssertionConfig, context: string | AssertionContext): AssertionResult {
  const ctx: AssertionContext = typeof context === "string" ? { output: context } : context;
  switch (assertion.type) {
    case "contains":
      return evaluateContains(assertion, ctx.output);
    case "not_contains":
      return evaluateNotContains(assertion, ctx.output);
    case "regex":
      return evaluateRegex(assertion, ctx.output);
    case "json_schema":
      return evaluateJsonSchema(assertion, ctx.output);
    case "max_length":
      return evaluateMaxLength(assertion, ctx.output);
    case "tool_called":
    case "tool_not_called":
    case "tool_args_match":
    case "no_undeclared_tools":
    case "max_steps":
      return evaluateTraceAssertion(assertion, ctx);
    default:
      return exhaustive(assertion);
  }
}

function evaluateContains(assertion: Extract<AssertionConfig, { type: "contains" }>, output: string): AssertionResult {
  const passed = normalize(output, assertion.case_sensitive).includes(normalize(assertion.value, assertion.case_sensitive));
  return {
    type: assertion.type,
    passed,
    expected: assertion.value,
    message: passed ? undefined : `Expected output to contain "${assertion.value}"`
  };
}

function evaluateNotContains(assertion: Extract<AssertionConfig, { type: "not_contains" }>, output: string): AssertionResult {
  const passed = !normalize(output, assertion.case_sensitive).includes(normalize(assertion.value, assertion.case_sensitive));
  return {
    type: assertion.type,
    passed,
    expected: assertion.value,
    message: passed ? undefined : `Expected output not to contain "${assertion.value}"`
  };
}

function evaluateRegex(assertion: Extract<AssertionConfig, { type: "regex" }>, output: string): AssertionResult {
  const pattern = assertion.pattern ?? assertion.value ?? "";
  const regex = new RegExp(pattern, assertion.flags);
  const passed = regex.test(output);
  return {
    type: assertion.type,
    passed,
    expected: `/${pattern}/${assertion.flags ?? ""}`,
    message: passed ? undefined : `Expected output to match /${pattern}/${assertion.flags ?? ""}`
  };
}

function evaluateJsonSchema(assertion: Extract<AssertionConfig, { type: "json_schema" }>, output: string): AssertionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    return {
      type: assertion.type,
      passed: false,
      expected: assertion.schema,
      actual: output,
      message: `Expected valid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const message = validateAgainstSchema(assertion.schema, parsed);

  return {
    type: assertion.type,
    passed: message === undefined,
    expected: assertion.schema,
    actual: parsed,
    message
  };
}

function evaluateMaxLength(assertion: Extract<AssertionConfig, { type: "max_length" }>, output: string): AssertionResult {
  const passed = output.length <= assertion.value;
  return {
    type: assertion.type,
    passed,
    expected: assertion.value,
    actual: output.length,
    message: passed ? undefined : `Expected output length <= ${assertion.value}, received ${output.length}`
  };
}

function normalize(value: string, caseSensitive = false): string {
  return caseSensitive ? value : value.toLowerCase();
}

function exhaustive(value: never): never {
  throw new Error(`Unsupported assertion: ${JSON.stringify(value)}`);
}
