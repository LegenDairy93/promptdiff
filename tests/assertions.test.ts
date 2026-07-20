import { describe, expect, it } from "vitest";
import { evaluateAssertion } from "../src/assertions/evaluateAssertion.js";
import type { AgentTraceStep } from "../src/artifacts/types.js";

describe("evaluateAssertion", () => {
  it("evaluates contains and not_contains assertions", () => {
    expect(evaluateAssertion({ type: "contains", value: "refund" }, "Refund request received").passed).toBe(true);
    expect(evaluateAssertion({ type: "not_contains", value: "guaranteed" }, "Refund request received").passed).toBe(true);
  });

  it("evaluates regex assertions", () => {
    expect(evaluateAssertion({ type: "regex", pattern: "case-[0-9]+", flags: "i" }, "CASE-123").passed).toBe(true);
  });

  it("evaluates max_length assertions", () => {
    expect(evaluateAssertion({ type: "max_length", value: 5 }, "hello").passed).toBe(true);
    expect(evaluateAssertion({ type: "max_length", value: 4 }, "hello").passed).toBe(false);
  });

  it("evaluates json_schema assertions", () => {
    const assertion = {
      type: "json_schema" as const,
      schema: {
        type: "object",
        required: ["category"],
        properties: {
          category: { type: "string" }
        }
      }
    };

    expect(evaluateAssertion(assertion, "{\"category\":\"billing\"}").passed).toBe(true);
    expect(evaluateAssertion(assertion, "not json").passed).toBe(false);
  });
});

describe("trace assertions", () => {
  const trace: AgentTraceStep[] = [
    { type: "model", output: "thinking" },
    { type: "tool", name: "lookup", input: { days: 40, extra: true } },
    { type: "tool", name: "lookup", input: { days: 5 } },
    { type: "final", output: "done" }
  ];
  const ctx = { output: "done", trace, violations: [] };

  it("counts tool calls with min and max bounds", () => {
    expect(evaluateAssertion({ type: "tool_called", name: "lookup" }, ctx).passed).toBe(true);
    expect(evaluateAssertion({ type: "tool_called", name: "lookup", min_times: 3 }, ctx).passed).toBe(false);
    expect(evaluateAssertion({ type: "tool_called", name: "lookup", max_times: 1 }, ctx).passed).toBe(false);
    expect(evaluateAssertion({ type: "tool_called", name: "missing" }, ctx).passed).toBe(false);
    expect(evaluateAssertion({ type: "tool_called", name: "lookup" }, ctx).actual).toBe(2);
  });

  it("evaluates tool_not_called", () => {
    expect(evaluateAssertion({ type: "tool_not_called", name: "delete_all" }, ctx).passed).toBe(true);
    expect(evaluateAssertion({ type: "tool_not_called", name: "lookup" }, ctx).passed).toBe(false);
  });

  it("matches arguments as a deep subset, ignoring extra keys", () => {
    const base = { type: "tool_args_match" as const, name: "lookup", match: "any" as const };
    expect(evaluateAssertion({ ...base, args: { days: 40 } }, ctx).passed).toBe(true);
    expect(evaluateAssertion({ ...base, args: { days: 999 } }, ctx).passed).toBe(false);
    // "all" requires every call to match, and 40 !== 5
    expect(evaluateAssertion({ ...base, match: "all", args: { days: 40 } }, ctx).passed).toBe(false);
  });

  it("fails tool_args_match when the tool was never called", () => {
    const result = evaluateAssertion({ type: "tool_args_match", name: "absent", match: "all", args: { a: 1 } }, ctx);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("never called");
  });

  it("validates tool arguments against a JSON Schema", () => {
    const schema = { type: "object", required: ["days"], properties: { days: { type: "integer" } } };
    expect(evaluateAssertion({ type: "tool_args_match", name: "lookup", match: "all", schema }, ctx).passed).toBe(true);
    expect(evaluateAssertion(
      { type: "tool_args_match", name: "lookup", match: "all", schema: { type: "object", required: ["nope"] } },
      ctx
    ).passed).toBe(false);
  });

  it("reads no_undeclared_tools from the recorded violations", () => {
    expect(evaluateAssertion({ type: "no_undeclared_tools" }, ctx).passed).toBe(true);
    const dirty = { ...ctx, violations: [{ kind: "undeclared_tool" as const, step: 1, tool: "rm", message: "undeclared" }] };
    const result = evaluateAssertion({ type: "no_undeclared_tools" }, dirty);
    expect(result.passed).toBe(false);
    expect(result.actual).toEqual(["rm"]);
  });

  it("counts steps for max_steps, optionally filtered by type", () => {
    expect(evaluateAssertion({ type: "max_steps", value: 4, step_type: "all" }, ctx).passed).toBe(true);
    expect(evaluateAssertion({ type: "max_steps", value: 3, step_type: "all" }, ctx).passed).toBe(false);
    expect(evaluateAssertion({ type: "max_steps", value: 2, step_type: "tool" }, ctx).passed).toBe(true);
    expect(evaluateAssertion({ type: "max_steps", value: 1, step_type: "tool" }, ctx).passed).toBe(false);
  });

  it("fails loudly with no trace rather than passing vacuously", () => {
    // A vacuous pass on a negative assertion is a false green - the worst outcome for a gate.
    const noTrace = { output: "done" };
    for (const assertion of [
      { type: "tool_called" as const, name: "lookup" },
      { type: "tool_not_called" as const, name: "lookup" },
      { type: "no_undeclared_tools" as const },
      { type: "max_steps" as const, value: 99, step_type: "all" as const }
    ]) {
      const result = evaluateAssertion(assertion, noTrace);
      expect(result.passed, `${assertion.type} must not pass without a trace`).toBe(false);
      expect(result.message).toContain("requires an agent target");
    }
  });

  it("still accepts a bare output string for output-only assertions", () => {
    expect(evaluateAssertion({ type: "contains", value: "done" }, "done").passed).toBe(true);
  });
});
