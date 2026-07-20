import type { AgentTraceStep } from "../artifacts/types.js";
import type { AssertionConfig } from "../config/schema.js";
import type { AssertionContext, AssertionResult } from "./types.js";
import { validateAgainstSchema } from "./ajv.js";

type TraceAssertion = Extract<AssertionConfig, { type: "tool_called" | "tool_not_called" | "tool_args_match" | "no_undeclared_tools" | "max_steps" }>;

export function evaluateTraceAssertion(assertion: TraceAssertion, context: AssertionContext): AssertionResult {
  // A vacuous pass on a negative assertion would be a false green, so every trace assertion
  // fails loudly when there is no trace to inspect.
  if (!context.trace) {
    return {
      type: assertion.type,
      passed: false,
      expected: describe(assertion),
      actual: null,
      message: `${assertion.type} requires an agent target; this run captured no trace`
    };
  }

  switch (assertion.type) {
    case "tool_called": {
      const calls = toolCalls(context.trace, assertion.name).filter((step) => !assertion.args || deepSubset(assertion.args, step.input));
      const min = assertion.min_times ?? 1;
      const max = assertion.max_times ?? Number.POSITIVE_INFINITY;
      const passed = calls.length >= min && calls.length <= max;
      return {
        type: assertion.type, passed, expected: describe(assertion), actual: calls.length,
        message: passed ? undefined : `Expected ${describe(assertion)}, received ${calls.length}`
      };
    }
    case "tool_not_called": {
      const count = toolCalls(context.trace, assertion.name).length;
      return {
        type: assertion.type, passed: count === 0, expected: describe(assertion), actual: count,
        message: count === 0 ? undefined : `Expected tool "${assertion.name}" not to be called, received ${count} call(s)`
      };
    }
    case "tool_args_match": {
      const calls = toolCalls(context.trace, assertion.name);
      if (calls.length === 0) {
        return {
          type: assertion.type, passed: false, expected: describe(assertion), actual: null,
          message: `Expected tool "${assertion.name}" to be called with matching arguments, but it was never called`
        };
      }
      const failures = calls.filter((step) => argsFailure(assertion, step.input) !== undefined);
      const passed = assertion.match === "all" ? failures.length === 0 : failures.length < calls.length;
      const firstFailure = failures[0];
      return {
        type: assertion.type, passed, expected: describe(assertion),
        actual: passed ? undefined : firstFailure?.input ?? null,
        message: passed ? undefined : `Expected ${describe(assertion)}: ${argsFailure(assertion, firstFailure?.input)}`
      };
    }
    case "no_undeclared_tools": {
      const offending = (context.violations ?? []).filter((violation) => violation.kind === "undeclared_tool" || violation.kind === "malformed_step");
      const passed = offending.length === 0;
      return {
        type: assertion.type, passed, expected: describe(assertion),
        actual: offending.map((violation) => violation.tool ?? `step ${violation.step}`),
        message: passed ? undefined : offending.map((violation) => violation.message).join("; ")
      };
    }
    case "max_steps": {
      const count = assertion.step_type === "all"
        ? context.trace.length
        : context.trace.filter((step) => step.type === assertion.step_type).length;
      const passed = count <= assertion.value;
      return {
        type: assertion.type, passed, expected: describe(assertion), actual: count,
        message: passed ? undefined : `Expected ${describe(assertion)}, received ${count}`
      };
    }
    default:
      return exhaustive(assertion);
  }
}

function toolCalls(trace: AgentTraceStep[], name: string): AgentTraceStep[] {
  return trace.filter((step) => step.type === "tool" && step.name === name);
}

/** Returns a failure message, or undefined when the call's arguments satisfy the assertion. */
function argsFailure(assertion: Extract<AssertionConfig, { type: "tool_args_match" }>, input: unknown): string | undefined {
  if (assertion.args && !deepSubset(assertion.args, input)) return `arguments did not match ${JSON.stringify(assertion.args)}`;
  if (assertion.schema) return validateAgainstSchema(assertion.schema, input ?? {});
  return undefined;
}

/** True when every key/value in `expected` is present in `actual`. Extra keys in `actual` are ignored. */
function deepSubset(expected: unknown, actual: unknown): boolean {
  if (expected === null || typeof expected !== "object") return Object.is(expected, actual);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length && expected.every((item, index) => deepSubset(item, actual[index]));
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
  const target = actual as Record<string, unknown>;
  return Object.entries(expected as Record<string, unknown>).every(([key, value]) => key in target && deepSubset(value, target[key]));
}

function describe(assertion: TraceAssertion): string {
  switch (assertion.type) {
    case "tool_called": {
      const min = assertion.min_times ?? 1;
      const range = assertion.max_times === undefined ? `>= ${min}` : `between ${min} and ${assertion.max_times}`;
      return `tool "${assertion.name}" called ${range} time(s)`;
    }
    case "tool_not_called":
      return `tool "${assertion.name}" not called`;
    case "tool_args_match":
      return `${assertion.match === "all" ? "every" : "at least one"} call to "${assertion.name}" matches the expected arguments`;
    case "no_undeclared_tools":
      return "no undeclared tool calls";
    case "max_steps":
      return `at most ${assertion.value} ${assertion.step_type === "all" ? "" : `${assertion.step_type} `}step(s)`;
    default:
      return exhaustive(assertion);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unsupported trace assertion: ${JSON.stringify(value)}`);
}
