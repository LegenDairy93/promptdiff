import { describe, expect, it } from "vitest";
import { diffRuns } from "../src/diff/diffRuns.js";
import { formatReport } from "../src/diff/formatReport.js";
import type { RunArtifact } from "../src/artifacts/types.js";

describe("formatReport", () => {
  it("renders a self-contained report that reads Safe to ship when no regressions", () => {
    const left = artifact("base", "baseline", [["greeting", false]]);
    const right = artifact("cand", "candidate", [["greeting", true]]);

    const html = formatReport(diffRuns(left, right), left, right);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain("Safe to ship");
    expect(html).toContain("now passing");
    expect(html).toContain("greeting");
    // no unresolved template placeholders leaked into the output
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("[object Object]");
  });

  it("reads Blocked and marks the case now failing when a regression exceeds the threshold", () => {
    const left = artifact("good", "candidate", [["greeting", true]]);
    const right = artifact("bad", "baseline", [["greeting", false]]);

    const html = formatReport(diffRuns(left, right), left, right, { maxRegressions: 0 });

    expect(html).toContain("Blocked");
    expect(html).toContain("now failing");
  });

  it("shows agent identity, tools, and trace steps", () => {
    const left = artifact("base", "baseline", [["refund", false]]);
    const right = artifact("agent", "candidate", [["refund", true]]);
    right.prompt = undefined;
    right.target = { kind: "agent", label: "candidate", sha256: "agent-hash", tools: ["lookup_policy"], command: ["node", "agent.mjs"] };
    right.cases[0].trace = [
      { type: "model", output: "check policy" },
      { type: "tool", name: "lookup_policy", output: { days: 30 } },
      { type: "final", output: "answer safely" }
    ];

    const html = formatReport(diffRuns(left, right), left, right);

    expect(html).toContain("What is being compared");
    expect(html).toContain("agent / candidate");
    expect(html).toContain("lookup_policy");
    expect(html).toContain("Candidate trace");
  });

  it("escapes HTML in case outputs so they cannot break the markup", () => {
    const left = artifact("base", "baseline", [["xss", false]]);
    const right = artifact("cand", "candidate", [["xss", true]]);
    right.cases[0].output = '<script>alert("x")</script>';

    const html = formatReport(diffRuns(left, right), left, right);

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});

function artifact(runId: string, label: string, cases: Array<[string, boolean]>): RunArtifact {
  const passed = cases.filter(([, result]) => result).length;
  return {
    runId,
    project: "demo",
    createdAt: new Date().toISOString(),
    provider: { type: "mock", model: "mock-v1", temperature: 0 },
    prompt: { label, path: `${label}.md`, sha256: "hash" },
    summary: { total: cases.length, passed, failed: cases.length - passed },
    cases: cases.map(([id, result]) => ({
      id,
      input: `input for ${id}`,
      output: result ? "pass" : "fail",
      passed: result,
      assertions: [{ type: "contains", passed: result, expected: "ok" }]
    }))
  };
}
