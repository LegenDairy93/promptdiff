import { describe, expect, it } from "vitest";
import { diffRuns } from "../src/diff/diffRuns.js";
import { formatReport } from "../src/diff/formatReport.js";
import type { RunArtifact } from "../src/artifacts/types.js";
import { agentArtifact, traceStep } from "./fixtures.js";

describe("formatReport", () => {
  it("renders a self-contained report that reads Promotion allowed when no regressions", () => {
    const left = artifact("base", "baseline", [["greeting", false]]);
    const right = artifact("cand", "candidate", [["greeting", true]]);

    const html = formatReport(diffRuns(left, right), left, right);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain("Promotion allowed");
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

    expect(html).toContain("Block promotion");
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

  it("renders a case whose only change is which tools ran", () => {
    // Guards the orderedChangedCaseIds fix: caseCard -> traceComparison only runs for changed
    // cases, so without tool changes feeding that set the whole feature is invisible here.
    const left = agentArtifact("l", "baseline", [
      { id: "refund", passed: true, output: "same", trace: [traceStep("tool", "lookup_policy")] }
    ], { tools: ["lookup_policy", "web_search"] });
    const right = agentArtifact("r", "candidate", [
      { id: "refund", passed: true, output: "same", trace: [traceStep("tool", "web_search")] }
    ], { tools: ["lookup_policy", "web_search"] });

    const diff = diffRuns(left, right);
    const html = formatReport(diff, left, right);

    expect(diff.outputChanges).toEqual([]);
    expect(html).toContain("refund");
    expect(html).toContain("trace-aligned");
    expect(html).toContain("web_search");
  });

  it("renders recorded violations for a case", () => {
    const left = agentArtifact("l", "baseline", [{ id: "a", passed: true, trace: [] }], { tools: ["allowed"] });
    const right = agentArtifact("r", "candidate", [{
      id: "a", passed: false,
      trace: [traceStep("tool", "rm")],
      violations: [{ kind: "undeclared_tool", step: 0, tool: "rm", message: "tool \"rm\" was called but is not declared on this target" }]
    }], { tools: ["allowed"] });

    const html = formatReport(diffRuns(left, right), left, right);

    expect(html).toContain("undeclared_tool");
    expect(html).toContain("not declared");
  });

  it("renders measured usage, cost, and an explicitly labelled projection", () => {
    const left = artifact("base", "baseline", [["refund", true]]);
    const right = artifact("cand", "candidate", [["refund", false]]);
    left.cases[0].usage = { inputTokens: 740, outputTokens: 310, costUsd: 0.004 };
    right.cases[0].usage = { inputTokens: 1120, outputTokens: 280, costUsd: 0.006 };

    const html = formatReport(diffRuns(left, right), left, right, { projectedCalls: 100_000 });

    expect(html).toContain("Measured usage and cost");
    expect(html).toContain("740");
    expect(html).toContain("1,120");
    expect(html).toContain("$0.004000");
    expect(html).toContain("$0.006000");
    expect(html).toContain("$400.00");
    expect(html).toContain("$600.00");
    expect(html).toContain("100,000 equivalent runs");
    expect(html).toContain("explicit assumption");
  });

  it("does not manufacture zero usage when a provider did not record it", () => {
    const left = artifact("base", "baseline", [["greeting", true]]);
    const right = artifact("cand", "candidate", [["greeting", true]]);

    const html = formatReport(diffRuns(left, right), left, right);

    expect(html).toContain("not recorded");
    expect(html).toContain("Usage reported for 0/1 baseline cases and 0/1 candidate cases.");
    expect(html).toContain("No traffic projection shown");
    expect(html).not.toContain("Scenario estimate");
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

describe("formatReport execution evidence", () => {
  it("renders measured per-run latency without inventing missing values", () => {
    const left = artifact("latency-left", "baseline", [["case", true]]);
    const right = artifact("latency-right", "candidate", [["case", true]]);
    left.cases[0].execution = { provider: "openrouter", model: "model/a", latencyMs: 900 };
    right.cases[0].execution = { provider: "openrouter", model: "model/b", latencyMs: 1250 };
    const html = formatReport(diffRuns(left, right), left, right);
    expect(html).toContain("Measured latency / run");
    expect(html).toContain("900ms");
    expect(html).toContain("1.25s");
    expect(html).toContain("Latency recorded for 1/1 and 1/1");
    expect(html).toContain("model/a");
    expect(html).toContain("model/b");
  });

  it("renders an unchanged observed model path even without a model-change event", () => {
    const left = artifact("model-left", "baseline", [["case", true]]);
    const right = artifact("model-right", "candidate", [["case", true]]);
    left.cases[0].execution = { provider: "openrouter", model: "same-model", latencyMs: 10 };
    right.cases[0].execution = { provider: "openrouter", model: "same-model", latencyMs: 11 };
    const html = formatReport(diffRuns(left, right), left, right);
    expect(html).toContain("Observed model path");
    expect(html).toContain("openrouter/same-model");
    expect(diffRuns(left, right).modelChanges).toEqual([]);
  });
});