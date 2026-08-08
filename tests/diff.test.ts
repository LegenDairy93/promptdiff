import { describe, expect, it } from "vitest";
import { diffRuns } from "../src/diff/diffRuns.js";
import { agentArtifact, legacyArtifact, traceStep } from "./fixtures.js";

describe("diffRuns", () => {
  it("detects newly passing and newly failing cases", () => {
    const left = legacyArtifact("left", "left", [["a", true], ["b", false], ["c", true]]);
    const right = legacyArtifact("right", "right", [["a", false], ["b", true], ["c", true]]);

    const diff = diffRuns(left, right);

    expect(diff.newlyFailing).toEqual(["a"]);
    expect(diff.newlyPassing).toEqual(["b"]);
    expect(diff.regressionCount).toBe(1);
    expect(diff.passRateDelta).toBeCloseTo(0);
  });

  it("legacy artifacts without traces produce no tool changes", () => {
    const diff = diffRuns(legacyArtifact("l", "l", [["a", true]]), legacyArtifact("r", "r", [["a", true]]));

    expect(diff.toolChanges).toEqual([]);
    expect(diff.violationChanges).toEqual([]);
    expect(diff.regressionCount).toBe(0);
  });
});

describe("diffRuns tool awareness", () => {
  // The blind spot this feature exists to close: same answer, different execution path.
  const left = agentArtifact("left", "baseline", [
    { id: "refund", passed: true, trace: [traceStep("tool", "lookup_policy"), traceStep("final")] }
  ], { tools: ["lookup_policy", "web_search"] });

  const right = agentArtifact("right", "candidate", [
    { id: "refund", passed: true, trace: [traceStep("tool", "web_search"), traceStep("final")] }
  ], { tools: ["lookup_policy", "web_search"] });

  it("reports tool changes when output is identical", () => {
    const diff = diffRuns(left, right);

    expect(diff.outputChanges).toEqual([]);
    expect(diff.toolChanges).toEqual([
      expect.objectContaining({ name: "lookup_policy", status: "removed", leftCalls: 1, rightCalls: 0 }),
      expect.objectContaining({ name: "web_search", status: "added", leftCalls: 0, rightCalls: 1 })
    ]);
  });

  it("does not gate on tool drift by default", () => {
    expect(diffRuns(left, right).regressionCount).toBe(0);
  });

  it("gates on tool drift when asked", () => {
    expect(diffRuns(left, right, { gateToolDrift: true }).regressionCount).toBe(1);
  });

  it("treats call-count changes as lower severity and does not gate them with --gate-tool-drift", () => {
    const twice = agentArtifact("twice", "candidate", [
      { id: "refund", passed: true, trace: [traceStep("tool", "lookup_policy"), traceStep("tool", "lookup_policy")] }
    ], { tools: ["lookup_policy"] });

    const diff = diffRuns(left, twice, { gateToolDrift: true });

    expect(diff.toolChanges).toEqual([expect.objectContaining({ status: "count_changed", severity: "count" })]);
    expect(diff.regressionCount).toBe(0);
    expect(diffRuns(left, twice, { gateCallDeltas: true }).regressionCount).toBe(1);
  });

  it("ranks write/external effect tools above ordinary drift", () => {
    const before = agentArtifact("before", "baseline", [{ id: "a", passed: true, trace: [] }], {
      toolDecls: [{ name: "search", effect: "read" }, { name: "delete_records", effect: "write" }]
    });
    const after = agentArtifact("after", "candidate", [
      { id: "a", passed: true, trace: [traceStep("tool", "search"), traceStep("tool", "delete_records")] }
    ], {
      toolDecls: [{ name: "search", effect: "read" }, { name: "delete_records", effect: "write" }]
    });

    const diff = diffRuns(before, after);

    expect(diff.toolChanges.map((change) => change.name)).toEqual(["delete_records", "search"]);
    expect(diff.toolChanges[0]?.severity).toBe("effect");
    expect(diff.toolChanges[1]?.severity).toBe("drift");
  });

  it("gates with no flags when an explicit assertion catches the drift", () => {
    // The recommended path: assertions gate through the existing assertionChanges route.
    const clean = agentArtifact("clean", "baseline", [
      { id: "a", passed: true, assertions: [{ type: "no_undeclared_tools", passed: true }] }
    ]);
    const dirty = agentArtifact("dirty", "candidate", [
      {
        id: "a", passed: false,
        assertions: [{ type: "no_undeclared_tools", passed: false, message: 'tool "rm" was called but is not declared on this target' }],
        violations: [{ kind: "undeclared_tool", step: 0, tool: "rm", message: 'tool "rm" was called but is not declared on this target' }]
      }
    ]);

    const diff = diffRuns(clean, dirty);

    expect(diff.regressionCount).toBe(1);
    expect(diff.violationChanges).toEqual([
      expect.objectContaining({ kind: "undeclared_tool", leftCount: 0, rightCount: 1, tools: ["rm"] })
    ]);
  });
});

describe("diffRuns model path awareness", () => {
  const left = agentArtifact("left-model", "baseline", [{
    id: "route", passed: true, output: "same",
    trace: [{ type: "model", name: "planner", provider: "openrouter", model: "model/a", output: "same" }]
  }]);
  const right = agentArtifact("right-model", "candidate", [{
    id: "route", passed: true, output: "same",
    trace: [{ type: "model", name: "planner", provider: "openrouter", model: "model/b", output: "same" }]
  }]);

  it("reports a model substitution even when output is identical", () => {
    const diff = diffRuns(left, right);
    expect(diff.outputChanges).toEqual([]);
    expect(diff.modelChanges).toEqual([{ caseId: "route", step: 1, left: "openrouter/model/a", right: "openrouter/model/b" }]);
  });
});
describe("diffRuns provider response identity", () => {
  it("reports the actual returned model, not only configured target metadata", () => {
    const left = agentArtifact("actual-left", "baseline", [{ id: "same", passed: true, output: "same", execution: { provider: "openrouter", model: "routed/a", latencyMs: 10 } }]);
    const right = agentArtifact("actual-right", "candidate", [{ id: "same", passed: true, output: "same", execution: { provider: "openrouter", model: "routed/b", latencyMs: 11 } }]);
    expect(diffRuns(left, right).modelChanges).toEqual([{ caseId: "same", step: "response", left: "openrouter/routed/a", right: "openrouter/routed/b" }]);
  });
});