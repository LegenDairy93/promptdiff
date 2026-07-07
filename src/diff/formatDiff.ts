import type { RunDiff } from "./diffRuns.js";
import { formatTable } from "../output/table.js";

export function formatDiff(diff: RunDiff): string {
  const lines: string[] = [];

  lines.push(`Left:  ${diff.leftRunId}`);
  lines.push(`Right: ${diff.rightRunId}`);
  lines.push("");
  lines.push(formatTable([
    ["Metric", "Left", "Right", "Delta"],
    ["Pass rate", percent(diff.leftPassRate), percent(diff.rightPassRate), signedPercent(diff.passRateDelta)],
    ["Regressions", "", String(diff.regressionCount), ""]
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
