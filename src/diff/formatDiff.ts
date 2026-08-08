import type { ExecutionSummary, RunDiff } from "./diffRuns.js";
import { formatTable } from "../output/table.js";

export function formatDiff(diff: RunDiff, maxRegressions = 0): string {
  const lines: string[] = [];

  lines.push(`Left:  ${diff.leftRunId}`);
  lines.push(`Right: ${diff.rightRunId}`);
  lines.push("");
  lines.push(formatTable([
    ["Metric", "Left", "Right", "Delta"],
    ["Pass rate", percent(diff.leftPassRate), percent(diff.rightPassRate), signedPercent(diff.passRateDelta)],
    ["Regressions", "", String(diff.regressionCount), ""]
  ]));
  lines.push(`Gate verdict: ${diff.regressionCount > maxRegressions ? "BLOCK" : "ALLOW"} (${diff.regressionCount} regressions, ${maxRegressions} allowed)`);
  lines.push("");
  lines.push("Execution evidence");
  lines.push(formatTable([
    ["Evidence", "Left", "Right"],
    ["Models", formatModels(diff.leftExecution), formatModels(diff.rightExecution)],
    ["Latency / run", formatDuration(diff.leftExecution.latencyMs), formatDuration(diff.rightExecution.latencyMs)],
    ["Input tokens", formatNumber(diff.leftExecution.inputTokens), formatNumber(diff.rightExecution.inputTokens)],
    ["Output tokens", formatNumber(diff.leftExecution.outputTokens), formatNumber(diff.rightExecution.outputTokens)],
    ["Cost / run", formatMoney(diff.leftExecution.costUsd), formatMoney(diff.rightExecution.costUsd)],
    ["Coverage", formatCoverage(diff.leftExecution), formatCoverage(diff.rightExecution)]
  ]));
  lines.push("");
  lines.push(`Newly passing: ${formatList(diff.newlyPassing)}`);
  lines.push(`Newly failing:  ${formatList(diff.newlyFailing)}`);

  if (diff.assertionChanges.length > 0) {
    lines.push("");
    lines.push("Assertion changes");
    lines.push(formatTable([
      ["Case", "Assertion", "Left", "Right"],
      ...diff.assertionChanges.map((change) => [
        change.caseId,
        `${change.assertionIndex + 1}:${change.type}`,
        change.leftPassed ? "pass" : "fail",
        change.rightPassed ? "pass" : "fail"
      ])
    ]));
  }

  if (diff.modelChanges.length > 0) {
    lines.push("");
    lines.push("Model path changes");
    lines.push(formatTable([
      ["Case", "Model step", "Left", "Right"],
      ...diff.modelChanges.map((change) => [change.caseId, String(change.step), change.left, change.right])
    ]));
  }
  // Tool sections render above output changes: nothing gates on them by default, so visibility is the safeguard.
  if (diff.violationChanges.length > 0) {
    lines.push("");
    lines.push("Tool violations");
    lines.push(formatTable([
      ["Case", "Kind", "Left", "Right", "Tools"],
      ...diff.violationChanges.map((change) => [
        change.caseId,
        change.kind,
        String(change.leftCount),
        String(change.rightCount),
        formatList(change.tools)
      ])
    ]));
  }

  if (diff.toolChanges.length > 0) {
    lines.push("");
    lines.push("Tool changes");
    // Already severity-sorted. High-severity rows are never hidden behind a truncation.
    const alwaysShown = diff.toolChanges.filter((change) => change.severity === "violation" || change.severity === "effect");
    const shown = diff.toolChanges.slice(0, Math.max(3, alwaysShown.length));
    lines.push(formatTable([
      ["Case", "Tool", "Left", "Right", "Change"],
      ...shown.map((change) => [
        change.caseId,
        change.effect ? `${change.name} (${change.effect})` : change.name,
        String(change.leftCalls),
        String(change.rightCalls),
        change.status === "count_changed" ? "count" : change.status
      ])
    ]));
    if (diff.toolChanges.length > shown.length) {
      lines.push(`  ...and ${diff.toolChanges.length - shown.length} more`);
    }
  }

  if (diff.outputChanges.length > 0) {
    lines.push("");
    lines.push("Changed outputs");
    for (const change of diff.outputChanges.slice(0, 3)) {
      lines.push(`- ${change.caseId}: ${change.leftLength} chars -> ${change.rightLength} chars`);
      lines.push(`  left:  ${change.leftSnippet}`);
      lines.push(`  right: ${change.rightSnippet}`);
    }
    if (diff.outputChanges.length > 3) {
      lines.push(`  ...and ${diff.outputChanges.length - 3} more`);
    }
  }

  return lines.join("\n");
}

/**
 * Tool drift is informational by default, so the stricter policies have to be discoverable at the
 * moment they become relevant. Returns undefined when there is no ungated drift to mention.
 *
 * Lives here rather than in cli.ts so it is importable without executing the CLI.
 */
export function ungatedToolHint(
  diff: Pick<RunDiff, "toolChanges" | "violationChanges">,
  options: { gateToolDrift?: boolean; gateCallDeltas?: boolean }
): string | undefined {
  const drift = diff.toolChanges.filter((change) => change.status !== "count_changed").length + diff.violationChanges.length;
  const deltas = diff.toolChanges.filter((change) => change.status === "count_changed").length;
  const ungated = (options.gateToolDrift ? 0 : drift) + (options.gateCallDeltas ? 0 : deltas);
  if (ungated === 0) return undefined;
  return [
    ``,
    `${ungated} tool change${ungated === 1 ? "" : "s"} detected (informational — CI not affected).`,
    `  Gate on them:      --gate-tool-drift          (added/removed tools, new violations)`,
    `                     --gate-call-deltas         (call-count changes)`,
    `  Lock an invariant: add a \`no_undeclared_tools\` or \`tool_not_called\` assertion.`
  ].join("\n");
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPercent(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
function formatModels(summary: ExecutionSummary): string {
  return summary.models.length > 0 ? summary.models.join(", ") : "not recorded";
}

function formatDuration(value?: number): string {
  if (value === undefined) return "not recorded";
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function formatNumber(value?: number): string {
  return value === undefined ? "not recorded" : Math.round(value).toLocaleString("en-US");
}

function formatMoney(value?: number): string {
  return value === undefined ? "not recorded" : `$${value.toFixed(6)}`;
}

function formatCoverage(summary: ExecutionSummary): string {
  return `${summary.usageCases}/${summary.totalCases} usage; ${summary.latencyCases}/${summary.totalCases} latency`;
}
