import { describe, expect, it } from "vitest";
import { evaluateAssertion } from "../src/assertions/evaluateAssertion.js";

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
