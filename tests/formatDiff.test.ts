import { describe, expect, it } from "vitest";
import { diffRuns } from "../src/diff/diffRuns.js";
import { formatDiff, ungatedToolHint } from "../src/diff/formatDiff.js";
import { agentArtifact, traceStep } from "./fixtures.js";

const decls = [
  { name: "search", effect: "read" as const },
  { name: "delete_records", effect: "write" as const },
  { name: "notes", effect: "read" as const }
];

/** Nothing gates by default, so visibility is the safeguard — these guard that it stays true. */
describe("formatDiff tool sections", () => {
  const left = agentArtifact("l", "baseline", [
    { id: "a", passed: true, output: "same", trace: [traceStep("tool", "notes")] }
  ], { toolDecls: decls });

  const right = agentArtifact("r", "candidate", [
    {
      id: "a", passed: true, output: "changed",
      trace: [traceStep("tool", "notes"), traceStep("tool", "notes"), traceStep("tool", "search"), traceStep("tool", "delete_records")],
      violations: [{ kind: "undeclared_tool", step: 4, tool: "rm", message: "tool \"rm\" was called but is not declared on this target" }]
    }
  ], { toolDecls: decls });

  const text = formatDiff(diffRuns(left, right));

  it("renders tool sections above changed outputs", () => {
    expect(text.indexOf("Tool violations")).toBeGreaterThan(-1);
    expect(text.indexOf("Tool changes")).toBeGreaterThan(-1);
    expect(text.indexOf("Tool violations")).toBeLessThan(text.indexOf("Tool changes"));
    expect(text.indexOf("Tool changes")).toBeLessThan(text.indexOf("Changed outputs"));
  });

  it("orders write/external effect tools above ordinary drift and count changes", () => {
    expect(text.indexOf("delete_records")).toBeLessThan(text.indexOf("search"));
    expect(text.indexOf("search")).toBeLessThan(text.indexOf("notes"));
  });

  it("annotates a tool with its declared effect", () => {
    expect(text).toContain("delete_records (write)");
  });

  it("never truncates a high-severity row behind '...and N more'", () => {
    const many = agentArtifact("many", "candidate", Array.from({ length: 6 }, (_, index) => ({
      id: `case-${index}`, passed: true,
      trace: [traceStep("tool", index === 5 ? "delete_records" : "notes")]
    })), { toolDecls: decls });
    const base = agentArtifact("base", "baseline", Array.from({ length: 6 }, (_, index) => ({
      id: `case-${index}`, passed: true, trace: []
    })), { toolDecls: decls });

    const rendered = formatDiff(diffRuns(base, many));

    expect(rendered).toContain("delete_records");
  });

  it("omits the tool sections entirely for prompt-only diffs", () => {
    const a = agentArtifact("a", "l", [{ id: "x", passed: true }]);
    const b = agentArtifact("b", "r", [{ id: "x", passed: true }]);

    const rendered = formatDiff(diffRuns(a, b));

    expect(rendered).not.toContain("Tool changes");
    expect(rendered).not.toContain("Tool violations");
  });
});

describe("ungatedToolHint", () => {
  const diff = diffRuns(
    agentArtifact("l", "baseline", [{ id: "a", passed: true, trace: [] }], { toolDecls: decls }),
    agentArtifact("r", "candidate", [{ id: "a", passed: true, trace: [traceStep("tool", "search")] }], { toolDecls: decls })
  );

  it("prints the opt-in path when drift is ungated", () => {
    const hint = ungatedToolHint(diff, {});
    expect(hint).toContain("informational");
    expect(hint).toContain("--gate-tool-drift");
    expect(hint).toContain("no_undeclared_tools");
  });

  it("stays quiet once the drift is gated", () => {
    expect(ungatedToolHint(diff, { gateToolDrift: true })).toBeUndefined();
  });

  it("stays quiet when there is nothing to report", () => {
    expect(ungatedToolHint({ toolChanges: [], violationChanges: [] }, {})).toBeUndefined();
  });
});
