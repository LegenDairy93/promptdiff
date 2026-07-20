import { describe, expect, it } from "vitest";
import { compileSchema, validateAgainstSchema } from "../src/assertions/ajv.js";

describe("schema cache", () => {
  it("reuses the compiled validator for the same schema", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };

    expect(compileSchema(schema)).toBe(compileSchema({ ...schema }));
  });

  it("hits the same cache entry when keys are reordered", () => {
    // YAML round-trips can reorder keys; a naive JSON.stringify key would miss the cache.
    const first = compileSchema({ type: "object", required: ["a"], properties: { a: { type: "string" } } });
    const second = compileSchema({ properties: { a: { type: "string" } }, required: ["a"], type: "object" });

    expect(first).toBe(second);
  });

  it("compiles distinct schemas separately", () => {
    expect(compileSchema({ type: "string" })).not.toBe(compileSchema({ type: "number" }));
  });
});

describe("validateAgainstSchema", () => {
  const schema = { type: "object", required: ["days"], properties: { days: { type: "integer" } } };

  it("returns undefined when the value is valid", () => {
    expect(validateAgainstSchema(schema, { days: 3 })).toBeUndefined();
  });

  it("returns a message naming the offending field", () => {
    expect(validateAgainstSchema(schema, { days: "three" })).toContain("days");
    expect(validateAgainstSchema(schema, {})).toContain("required");
  });

  it("does not leak errors between consecutive validations", () => {
    // Ajv overwrites .errors on each call; reading it late would report the wrong failure.
    expect(validateAgainstSchema(schema, {})).toBeTruthy();
    expect(validateAgainstSchema(schema, { days: 1 })).toBeUndefined();
    expect(validateAgainstSchema(schema, { days: "x" })).toBeTruthy();
    expect(validateAgainstSchema(schema, { days: 2 })).toBeUndefined();
  });
});
