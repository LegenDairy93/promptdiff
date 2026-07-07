import { describe, expect, it } from "vitest";
import { diffRuns } from "../src/diff/diffRuns.js";
import type { RunArtifact } from "../src/artifacts/types.js";

describe("diffRuns", () => {
  it("detects newly passing and newly failing cases", () => {
    const left = artifact("left", [
      ["a", true],
      ["b", false],
      ["c", true]
    ]);
    const right = artifact("right", [
      ["a", false],
      ["b", true],
      ["c", true]
    ]);

    const diff = diffRuns(left, right);

    expect(diff.newlyFailing).toEqual(["a"]);
    expect(diff.newlyPassing).toEqual(["b"]);
    expect(diff.regressionCount).toBe(1);
    expect(diff.passRateDelta).toBeCloseTo(0);
  });
});

function artifact(runId: string, cases: Array<[string, boolean]>): RunArtifact {
  const passed = cases.filter(([, result]) => result).length;
  return {
    runId,
    project: "demo",
    createdAt: new Date().toISOString(),
    provider: { type: "mock" },
    prompt: {
      label: runId,
      path: "prompt.md",
      sha256: "hash"
    },
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed
    },
    cases: cases.map(([id, result]) => ({
      id,
      input: id,
      output: result ? "pass" : "fail",
      passed: result,
      assertions: [
        {
          type: "contains",
          passed: result
        }
      ]
    }))
  };
}
