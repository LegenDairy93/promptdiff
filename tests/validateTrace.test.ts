import { describe, expect, it } from "vitest";
import { validateTrace } from "../src/runner/validateTrace.js";
import type { AgentTraceStep } from "../src/artifacts/types.js";

const lookup = {
  name: "lookup_refund_policy",
  args_schema: {
    type: "object",
    required: ["days_since_purchase"],
    properties: { days_since_purchase: { type: "integer", minimum: 0 } }
  }
};

const tool = (name: string, input?: unknown): AgentTraceStep => ({ type: "tool", name, input });

describe("validateTrace", () => {
  it("accepts a declared tool called with valid arguments", () => {
    const violations = validateTrace({
      steps: [{ type: "model" }, tool("lookup_refund_policy", { days_since_purchase: 40 }), { type: "final" }],
      declarations: [lookup]
    });

    expect(violations).toEqual([]);
  });

  it("flags a tool that was never declared", () => {
    const violations = validateTrace({ steps: [tool("web_search", { q: "x" })], declarations: [lookup] });

    expect(violations).toEqual([
      expect.objectContaining({ kind: "undeclared_tool", tool: "web_search", step: 0 })
    ]);
    expect(violations[0]?.message).toContain("not declared");
  });

  it("does not police tools when the target declared none", () => {
    // Opting out is the back-compat rule: without it every pre-existing agent config floods with violations.
    const violations = validateTrace({ steps: [tool("anything"), tool("else")], declarations: [] });

    expect(violations).toEqual([]);
  });

  it("flags arguments that fail the declared schema and carries the validator message", () => {
    const violations = validateTrace({
      steps: [tool("lookup_refund_policy", { days_since_purchase: "forty" })],
      declarations: [lookup]
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "invalid_args", tool: "lookup_refund_policy" });
    expect(violations[0]?.message).toContain("days_since_purchase");
  });

  it("treats a missing input as {} so required fields still fire", () => {
    const violations = validateTrace({ steps: [tool("lookup_refund_policy")], declarations: [lookup] });

    expect(violations).toEqual([expect.objectContaining({ kind: "invalid_args" })]);
    expect(violations[0]?.message).toContain("required");
  });

  it("flags a tool step with no name", () => {
    const violations = validateTrace({ steps: [{ type: "tool" }], declarations: [lookup] });

    expect(violations).toEqual([expect.objectContaining({ kind: "missing_tool_name", step: 0 })]);
  });

  it("ignores non-tool steps entirely", () => {
    const violations = validateTrace({
      steps: [{ type: "model", name: "undeclared-but-not-a-tool" }, { type: "final" }],
      declarations: [lookup]
    });

    expect(violations).toEqual([]);
  });

  it("passes malformed steps through and cites their raw index", () => {
    const violations = validateTrace({
      steps: [],
      declarations: [lookup],
      malformed: [{ index: 2, message: "invalid type", raw: 7 }]
    });

    expect(violations).toEqual([expect.objectContaining({ kind: "malformed_step", step: 2 })]);
    expect(violations[0]?.message).toContain("trace step 2");
  });

  it("cites the raw index of a surviving step when earlier steps were malformed", () => {
    // steps[0] is the third entry the agent emitted; violations must say 2, not 0.
    const violations = validateTrace({
      steps: [tool("web_search")],
      indices: [2],
      declarations: [lookup],
      malformed: [{ index: 0, message: "bad", raw: 1 }, { index: 1, message: "bad", raw: 2 }]
    });

    expect(violations.map((violation) => [violation.kind, violation.step])).toEqual([
      ["malformed_step", 0],
      ["malformed_step", 1],
      ["undeclared_tool", 2]
    ]);
  });
});
