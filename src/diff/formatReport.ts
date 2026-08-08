import type { AssertionResult } from "../assertions/types.js";
import { getArtifactTarget, getArtifactToolDecls, type AgentTraceStep, type RunArtifact } from "../artifacts/types.js";
import type { RunDiff } from "./diffRuns.js";

export type ReportOptions = {
  maxRegressions?: number;
  /** Optional traffic assumption. Used only for a clearly labelled cost projection. */
  projectedCalls?: number;
};

/**
 * Render a self-contained HTML report from a diff and its two run artifacts.
 * Pure function: no I/O, no external assets, no network. The returned string
 * is a complete HTML document that opens offline in any browser.
 */
export function formatReport(
  diff: RunDiff,
  left: RunArtifact,
  right: RunArtifact,
  options: ReportOptions = {}
): string {
  const maxRegressions = options.maxRegressions ?? 0;
  const blocked = diff.regressionCount > maxRegressions;

  const leftPct = Math.round(diff.leftPassRate * 100);
  const rightPct = Math.round(diff.rightPassRate * 100);
  const deltaPts = Math.round(diff.passRateDelta * 100);
  const improved = deltaPts >= 0;

  const leftTarget = getArtifactTarget(left);
  const rightTarget = getArtifactTarget(right);
  const leftUsage = summarizeUsage(left);
  const rightUsage = summarizeUsage(right);

  const leftCases = new Map(left.cases.map((testCase) => [testCase.id, testCase]));
  const rightCases = new Map(right.cases.map((testCase) => [testCase.id, testCase]));

  const changedCaseIds = orderedChangedCaseIds(diff, left, right);

  const verdict = blocked
    ? `<div class="verdict bad"><span class="dot"></span><span><small>Promotion decision</small>Block promotion &middot; ${diff.regressionCount} regression${diff.regressionCount === 1 ? "" : "s"}</span></div>`
    : `<div class="verdict good"><span class="dot"></span><span><small>Promotion decision</small>Promotion allowed &middot; within max ${maxRegressions}</span></div>`;
  const body = `
  <header class="masthead">
    <div>
      <div class="brand">
        <span class="wordmark">prompt<span class="dim">diff</span></span>
        <span class="tag">diff report</span>
      </div>
      <div class="subhead">
        <span><b>Project</b> ${esc(right.project)}</span>
        <span><b>Candidate runtime</b> ${esc(targetRuntime(rightTarget, right))}</span>
        <span><b>Latest run</b> ${esc(right.createdAt)}</span>
      </div>
    </div>
    ${verdict}
  </header>

  <div class="compare">
    <span class="side"><span class="lab">${esc(leftTarget.kind)} / ${esc(leftTarget.label)}</span> ${esc(left.runId)}</span>
    <span class="arrow">&rarr;</span>
    <span class="side"><span class="lab">${esc(rightTarget.kind)} / ${esc(rightTarget.label)}</span> ${esc(right.runId)}</span>
  </div>

  ${targetSection(leftTarget, rightTarget, left, right)}

  <section>
    <h2 class="eyebrow">Behavior summary</h2>
    <div class="tiles">
      <div class="tile">
        <span class="k">Pass rate</span>
        <span class="v"><span class="from">${leftPct}%</span> &rarr; <span class="${improved ? "to-up" : "to-down"}">${rightPct}%</span></span>
        <span class="delta ${improved ? "up" : "down"}">${improved ? "&#9650;" : "&#9660;"} ${signed(deltaPts)} points</span>
        <div class="bar"><i class="${improved ? "" : "neg"}" style="--fill:${rightPct}%"></i></div>
      </div>
      <div class="tile">
        <span class="k">Regressions</span>
        <span class="v ${blocked ? "bad-v" : ""}">${diff.regressionCount}</span>
        <span class="delta ${blocked ? "down" : "flat"}">${blocked ? "exceeds" : "within"} threshold (max ${maxRegressions})</span>
      </div>
      <div class="tile">
        <span class="k">Newly passing</span>
        <span class="v" style="color:var(--good)">${diff.newlyPassing.length}</span>
        <span class="delta ${diff.newlyPassing.length ? "up" : "flat"}">${diff.newlyPassing.length ? esc(diff.newlyPassing.join(" · ")) : "none"}</span>
      </div>
      <div class="tile">
        <span class="k">Newly failing</span>
        <span class="v ${diff.newlyFailing.length ? "bad-v" : ""}">${diff.newlyFailing.length}</span>
        <span class="delta ${diff.newlyFailing.length ? "down" : "flat"}">${diff.newlyFailing.length ? esc(diff.newlyFailing.join(" · ")) : "none"}</span>
      </div>
    </div>
  </section>

  ${usageSummarySection(leftUsage, rightUsage, options.projectedCalls)}

  <section>
    <h2 class="eyebrow">Case outcomes</h2>
    <div class="chip-row" style="margin-bottom:12px">
      <span class="chip-lead">Newly passing</span>
      ${chips(diff.newlyPassing, "good")}
    </div>
    <div class="chip-row">
      <span class="chip-lead">Newly failing</span>
      ${chips(diff.newlyFailing, "bad")}
    </div>
  </section>

  ${diff.assertionChanges.length ? assertionChangesSection(diff) : ""}

  ${diff.modelChanges.length ? modelChangesSection(diff) : ""}

  <section>
    <h2 class="eyebrow">Case detail</h2>
    ${changedCaseIds.length
      ? changedCaseIds.map((id) => caseCard(id, leftCases.get(id), rightCases.get(id))).join("\n")
      : `<p class="empty">No case-level changes between these runs.</p>`}
  </section>

  <footer>
    <span class="local"><span class="dot"></span> Self-contained report &mdash; no external assets</span>
    <span class="spacer"></span>
    <span class="mono">provider: ${esc(right.provider.type)}</span>
  </footer>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>promptdiff report &middot; ${esc(right.project)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
${body}
</div>
</body>
</html>
`;
}

type UsageSummary = {
  totalCases: number;
  reportedCases: number;
  latencyCases: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
};

function summarizeUsage(artifact: RunArtifact): UsageSummary {
  let reportedCases = 0;
  let latencyCases = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let latencyMs = 0;
  let hasInput = false;
  let hasOutput = false;
  let hasCost = false;

  for (const testCase of artifact.cases) {
    const usage = testCase.usage;
    if (usage) {
      reportedCases += 1;
      if (typeof usage.inputTokens === "number") { inputTokens += usage.inputTokens; hasInput = true; }
      if (typeof usage.outputTokens === "number") { outputTokens += usage.outputTokens; hasOutput = true; }
      if (typeof usage.costUsd === "number") { costUsd += usage.costUsd; hasCost = true; }
    }
    if (typeof testCase.execution?.latencyMs === "number") {
      latencyCases += 1;
      latencyMs += testCase.execution.latencyMs;
    }
  }

  return {
    totalCases: artifact.cases.length,
    reportedCases,
    latencyCases,
    inputTokens: hasInput ? inputTokens : undefined,
    outputTokens: hasOutput ? outputTokens : undefined,
    costUsd: hasCost ? costUsd : undefined,
    latencyMs: latencyCases > 0 ? latencyMs : undefined
  };
}

function usageSummarySection(left: UsageSummary, right: UsageSummary, projectedCalls?: number): string {
  const coverage = `Usage reported for ${left.reportedCases}/${left.totalCases} baseline cases and ${right.reportedCases}/${right.totalCases} candidate cases. Latency recorded for ${left.latencyCases}/${left.totalCases} and ${right.latencyCases}/${right.totalCases}.`;
  const projection = typeof projectedCalls === "number" && projectedCalls > 0
    ? `<div class="tile scenario">
        <span class="k">Scenario estimate</span>
        <span class="v">${metricPair(
          left.costUsd === undefined ? undefined : left.costUsd * projectedCalls,
          right.costUsd === undefined ? undefined : right.costUsd * projectedCalls,
          money
        )}</span>
        <span class="delta flat">${formatInteger(projectedCalls)} equivalent runs &middot; explicit assumption</span>
      </div>`
    : "";

  return `<section class="economics">
    <div class="section-title-row">
      <h2 class="eyebrow">Measured usage and cost</h2>
      <span class="coverage">${esc(coverage)}</span>
    </div>
    <div class="tiles usage-tiles">
      <div class="tile">
        <span class="k">Input tokens / run</span>
        <span class="v">${metricPair(left.inputTokens, right.inputTokens, formatInteger)}</span>
        <span class="delta flat">${deltaText(left.inputTokens, right.inputTokens, formatInteger)}</span>
      </div>
      <div class="tile">
        <span class="k">Output tokens / run</span>
        <span class="v">${metricPair(left.outputTokens, right.outputTokens, formatInteger)}</span>
        <span class="delta flat">${deltaText(left.outputTokens, right.outputTokens, formatInteger)}</span>
      </div>
      <div class="tile">
        <span class="k">Measured latency / run</span>
        <span class="v">${metricPair(left.latencyMs, right.latencyMs, duration)}</span>
        <span class="delta flat">${latencyDeltaText(left.latencyMs, right.latencyMs)}</span>
      </div>
      <div class="tile">
        <span class="k">Measured cost / run</span>
        <span class="v">${metricPair(left.costUsd, right.costUsd, money)}</span>
        <span class="delta ${costTone(left.costUsd, right.costUsd)}">${deltaText(left.costUsd, right.costUsd, money)}</span>
      </div>
      ${projection}
    </div>
    ${projectedCalls ? "" : `<p class="assumption">No traffic projection shown. Add <code>--projected-calls</code> to model an explicitly labelled scenario.</p>`}
  </section>`;
}

function metricPair(left: number | undefined, right: number | undefined, format: (value: number) => string): string {
  if (left === undefined || right === undefined) return `<span class="unavailable">not recorded</span>`;
  return `<span class="from">${format(left)}</span> &rarr; <span>${format(right)}</span>`;
}

function deltaText(left: number | undefined, right: number | undefined, format: (value: number) => string): string {
  if (left === undefined || right === undefined) return "No comparable usage data";
  const delta = right - left;
  return `${delta >= 0 ? "+" : ""}${format(delta)} change`;
}

function latencyDeltaText(left?: number, right?: number): string {
  if (left === undefined || right === undefined) return "No comparable latency data";
  const delta = right - left;
  return `${delta >= 0 ? "+" : ""}${duration(delta)} change`;
}

function duration(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return absolute >= 1000 ? `${sign}${(absolute / 1000).toFixed(2)}s` : `${sign}${Math.round(absolute)}ms`;
}
function costTone(left?: number, right?: number): "up" | "down" | "flat" {
  if (left === undefined || right === undefined || left === right) return "flat";
  return right < left ? "up" : "down";
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function money(value: number): string {
  const absolute = Math.abs(value);
  const digits = absolute === 0 ? 2 : absolute < 0.01 ? 6 : absolute < 1 ? 4 : 2;
  return `${value < 0 ? "-" : ""}$${absolute.toFixed(digits)}`;
}
function orderedChangedCaseIds(diff: RunDiff, left: RunArtifact, right: RunArtifact): string[] {
  const changed = new Set<string>([
    ...diff.newlyPassing,
    ...diff.newlyFailing,
    ...diff.assertionChanges.map((change) => change.caseId),
    ...diff.outputChanges.map((change) => change.caseId),
    ...diff.modelChanges.map((change) => change.caseId),
    // Without these, a case whose only change is which tools ran never renders — and the
    // trace comparison, the whole point of the feature, stays invisible.
    ...diff.toolChanges.map((change) => change.caseId),
    ...diff.violationChanges.map((change) => change.caseId)
  ]);
  const order = [...left.cases.map((c) => c.id), ...right.cases.map((c) => c.id)];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of order) {
    if (changed.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

function caseCard(
  id: string,
  leftCase?: RunArtifact["cases"][number],
  rightCase?: RunArtifact["cases"][number]
): string {
  const wasPassing = leftCase?.passed ?? false;
  const nowPassing = rightCase?.passed ?? false;
  const status = statusPill(wasPassing, nowPassing);
  const input = rightCase?.input ?? leftCase?.input ?? "";

  const leftOut = leftCase ? esc(leftCase.output) : "&mdash; not present in left run";
  const rightOut = rightCase ? esc(rightCase.output) : "&mdash; not present in right run";

  return `<article class="case">
    <div class="case-head">
      <span class="case-id">${esc(id)}</span>
      ${status}
    </div>
    <div class="case-input"><span class="lab">Input</span><span class="q">${esc(input)}</span></div>
    <div class="io">
      <div class="before">
        <div class="side-lab">Baseline</div>
        <div class="out">${leftOut}</div>
      </div>
      <div class="after">
        <div class="side-lab">Candidate</div>
        <div class="out">${rightOut}</div>
      </div>
    </div>
    ${traceComparison(leftCase, rightCase)}
    ${violationRows(rightCase?.violations ?? [])}
    ${assertionRows(leftCase?.assertions ?? [], rightCase?.assertions ?? [])}
  </article>`;
}

function violationRows(violations: NonNullable<RunArtifact["cases"][number]["violations"]>): string {
  if (violations.length === 0) return "";
  const rows = violations.map((violation) => `<div class="row violation">
    <span class="atype">${esc(violation.kind)}</span>
    <span class="aval">${esc(violation.tool ? `${violation.tool} · step ${violation.step}` : `step ${violation.step}`)}</span>
    <span class="aval grow">${esc(violation.message)}</span>
  </div>`).join("");
  return `<div class="asserts violations">${rows}</div>`;
}

function statusPill(was: boolean, now: boolean): string {
  if (!was && now) return `<span class="pill pass">now passing</span>`;
  if (was && !now) return `<span class="pill fail">now failing</span>`;
  if (was && now) return `<span class="pill neutral">still passing</span>`;
  return `<span class="pill neutral">still failing</span>`;
}

function targetSection(
  left: ReturnType<typeof getArtifactTarget>,
  right: ReturnType<typeof getArtifactTarget>,
  leftArtifact: RunArtifact,
  rightArtifact: RunArtifact
): string {
  const row = (label: string, before: string, after: string) => `<div class="row"><span class="atype">${esc(label)}</span><span class="aval">${esc(before)}</span><span class="flip">&rarr;</span><span class="aval">${esc(after)}</span></div>`;
  return `<section><h2 class="eyebrow">What is being compared</h2><div class="asserts target-card">
    ${row("kind", left.kind, right.kind)}
    ${row("source", left.path ?? "embedded", right.path ?? "embedded")}
    ${row("runtime", targetRuntime(left, leftArtifact), targetRuntime(right, rightArtifact))}
    ${row("tools", describeTools(left), describeTools(right))}
    ${row("identity", left.sha256.slice(0, 12), right.sha256.slice(0, 12))}
  </div></section>`;
}

function targetRuntime(target: ReturnType<typeof getArtifactTarget>, artifact: RunArtifact): string {
  return target.command?.join(" ") ?? providerLabel(artifact);
}

/** Tool names, annotated with declared effect and whether their arguments are schema-checked. */
function describeTools(target: ReturnType<typeof getArtifactTarget>): string {
  const declarations = getArtifactToolDecls(target);
  if (declarations.length === 0) return "none";
  return declarations.map((declaration) => {
    const notes = [declaration.effect, declaration.args_schema ? "schema" : undefined].filter(Boolean);
    return notes.length > 0 ? `${declaration.name} (${notes.join(", ")})` : declaration.name;
  }).join(", ");
}

type TraceRow = { left?: AgentTraceStep; right?: AgentTraceStep; state: "same" | "changed" | "added" | "removed" };

/**
 * Align the two traces rather than dumping them side by side, so the reader can see which step
 * actually differs. Greedy two-pointer with a small lookahead: agent traces are short and mostly
 * prefix-identical, where this is indistinguishable from full LCS at a fraction of the code.
 */
function alignTraces(left: AgentTraceStep[] = [], right: AgentTraceStep[] = [], lookahead = 3): TraceRow[] {
  const key = (step: AgentTraceStep) => `${step.type}:${step.name ?? ""}`;
  const rows: TraceRow[] = [];
  let l = 0;
  let r = 0;
  while (l < left.length && r < right.length) {
    const leftStep = left[l]!;
    const rightStep = right[r]!;
    if (key(leftStep) === key(rightStep)) {
      const same = stringify(leftStep) === stringify(rightStep);
      rows.push({ left: leftStep, right: rightStep, state: same ? "same" : "changed" });
      l += 1; r += 1;
      continue;
    }
    // Does the current left step reappear soon on the right? If so the right side inserted steps.
    const aheadInRight = right.slice(r + 1, r + 1 + lookahead).findIndex((step) => key(step) === key(leftStep));
    if (aheadInRight !== -1) {
      for (let skip = 0; skip <= aheadInRight; skip += 1) rows.push({ right: right[r + skip], state: "added" });
      r += aheadInRight + 1;
      continue;
    }
    const aheadInLeft = left.slice(l + 1, l + 1 + lookahead).findIndex((step) => key(step) === key(rightStep));
    if (aheadInLeft !== -1) {
      for (let skip = 0; skip <= aheadInLeft; skip += 1) rows.push({ left: left[l + skip], state: "removed" });
      l += aheadInLeft + 1;
      continue;
    }
    rows.push({ left: leftStep, right: rightStep, state: "changed" });
    l += 1; r += 1;
  }
  while (l < left.length) rows.push({ left: left[l++], state: "removed" });
  while (r < right.length) rows.push({ right: right[r++], state: "added" });
  return rows;
}

function traceComparison(leftCase?: RunArtifact["cases"][number], rightCase?: RunArtifact["cases"][number]): string {
  if (!leftCase?.trace && !rightCase?.trace) return "";
  const rows = alignTraces(leftCase?.trace, rightCase?.trace);
  if (rows.length === 0) return `<div class="trace"><span class="empty">no trace captured</span></div>`;
  const cell = (step?: AgentTraceStep) => {
    if (!step) return `<span class="empty">&mdash;</span>`;
    const modelIdentity = [step.provider, step.model].filter(Boolean).join("/");
    return `<b>${esc(step.type)}${step.name ? ` / ${esc(step.name)}` : ""}${modelIdentity ? ` / ${esc(modelIdentity)}` : ""}</b><span>${esc(stringify(step.output ?? step.input ?? ""))}</span>`;
  };
  const body = rows.map((row, index) => `<div class="trace-row ${row.state}">
    <span class="trace-n">${index + 1}</span>
    <div class="trace-step">${cell(row.left)}</div>
    <div class="trace-step">${cell(row.right)}</div>
  </div>`).join("");
  return `<div class="trace-aligned">
    <div class="trace-head"><span class="trace-n"></span><div class="side-lab">Baseline trace</div><div class="side-lab">Candidate trace</div></div>
    ${body}
  </div>`;
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function assertionRows(leftAssertions: AssertionResult[], rightAssertions: AssertionResult[]): string {
  const count = Math.max(leftAssertions.length, rightAssertions.length);
  if (count === 0) return "";

  const rows: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const l = leftAssertions[index];
    const r = rightAssertions[index];
    const type = r?.type ?? l?.type ?? "unknown";
    const detail = describeAssertion(r ?? l);
    rows.push(`<div class="row">
      <span class="atype">${esc(type)}</span>${detail ? `<span class="aval">${esc(detail)}</span>` : ""}
      <span class="transition">${token(l?.passed)}<span class="flip">&rarr;</span>${token(r?.passed)}</span>
    </div>`);
  }
  return `<div class="asserts">${rows.join("")}</div>`;
}

const TRACE_ASSERTIONS = new Set(["tool_called", "tool_not_called", "tool_args_match", "no_undeclared_tools", "max_steps"]);

function describeAssertion(assertion?: AssertionResult): string {
  if (!assertion || assertion.expected === undefined) return "";
  const { expected, actual } = assertion;
  // Trace assertions already describe themselves in prose; quoting them reads oddly.
  if (TRACE_ASSERTIONS.has(assertion.type) && typeof expected === "string") {
    return actual === undefined || actual === null ? expected : `${expected} · actual ${stringify(actual)}`;
  }
  if (typeof expected === "string") return `"${expected}"`;
  if (typeof expected === "number") {
    return typeof actual === "number" ? `${expected} · actual ${actual}` : String(expected);
  }
  if (assertion.type === "json_schema" && expected && typeof expected === "object") {
    const required = (expected as { required?: unknown }).required;
    if (Array.isArray(required)) return `required: ${required.join(", ")}`;
  }
  return "";
}

function token(passed?: boolean): string {
  if (passed === undefined) return `<span class="tk flat">&mdash;</span>`;
  return passed ? `<span class="tk pass">pass</span>` : `<span class="tk fail">fail</span>`;
}

function modelChangesSection(diff: RunDiff): string {
  const rows = diff.modelChanges.map((change) => `<tr>
    <td class="mono">${esc(change.caseId)}</td>
    <td class="mono">${esc(String(change.step))}</td>
    <td class="mono">${esc(change.left)}</td>
    <td class="flip">&rarr;</td>
    <td class="mono">${esc(change.right)}</td>
  </tr>`).join("");
  return `<section>
    <h2 class="eyebrow">Model path changes</h2>
    <div class="scroll"><table>
      <thead><tr><th>Case</th><th>Step</th><th>Baseline</th><th></th><th>Candidate</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}
function assertionChangesSection(diff: RunDiff): string {
  const rows = diff.assertionChanges
    .map(
      (change) => `<tr>
        <td class="mono">${esc(change.caseId)}</td>
        <td class="mono">${change.assertionIndex + 1}:${esc(change.type)}</td>
        <td class="state ${change.leftPassed ? "pass" : "fail"}">${change.leftPassed ? "pass" : "fail"}</td>
        <td class="flip">&rarr;</td>
        <td class="state ${change.rightPassed ? "pass" : "fail"}">${change.rightPassed ? "pass" : "fail"}</td>
      </tr>`
    )
    .join("");
  return `<section>
    <h2 class="eyebrow">Assertion changes</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>Case</th><th>Assertion</th><th>Baseline</th><th></th><th>Candidate</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function chips(ids: string[], tone: "good" | "bad"): string {
  if (ids.length === 0) return `<span class="chip none">none</span>`;
  return ids.map((id) => `<span class="chip ${tone}">${esc(id)}</span>`).join("");
}

function providerLabel(artifact: RunArtifact): string {
  const parts = [artifact.provider.type];
  if (artifact.provider.model) parts.push(artifact.provider.model);
  if (typeof artifact.provider.temperature === "number") parts.push(`temp ${artifact.provider.temperature}`);
  return parts.join(" · ");
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLES = `
:root{color-scheme:light dark;--ground:#f7f8fa;--surface:#fff;--surface-2:#f1f3f6;--ink:#131722;--ink-soft:#3a4152;--muted:#656d7e;--line:#e2e6ec;--line-strong:#cfd5df;--accent:#0a91ab;--accent-ink:#06687a;--accent-soft:#e0f4f8;--good:#12874a;--good-soft:#e4f4ea;--good-line:#b3e0c4;--bad:#d21f4a;--bad-soft:#fce8ed;--bad-line:#f4bccb;--radius:10px;--radius-sm:7px;--shadow:0 1px 2px rgba(19,23,34,.05),0 8px 24px -16px rgba(19,23,34,.25);--sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--mono:ui-monospace,"SF Mono","Cascadia Code","JetBrains Mono",Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--ground:#0d0f15;--surface:#161a23;--surface-2:#1d222d;--ink:#e8eaf0;--ink-soft:#c2c7d2;--muted:#8b93a4;--line:#262c38;--line-strong:#333b49;--accent:#2ec5da;--accent-ink:#7fe0ee;--accent-soft:#10333c;--good:#3ec76f;--good-soft:#12291c;--good-line:#1f4d31;--bad:#ff5c7c;--bad-soft:#2c141c;--bad-line:#522633;--shadow:0 1px 2px rgba(0,0,0,.3),0 12px 32px -18px rgba(0,0,0,.7)}}
:root[data-theme="light"]{--ground:#f7f8fa;--surface:#fff;--surface-2:#f1f3f6;--ink:#131722;--ink-soft:#3a4152;--muted:#656d7e;--line:#e2e6ec;--line-strong:#cfd5df;--accent:#0a91ab;--accent-ink:#06687a;--accent-soft:#e0f4f8;--good:#12874a;--good-soft:#e4f4ea;--good-line:#b3e0c4;--bad:#d21f4a;--bad-soft:#fce8ed;--bad-line:#f4bccb}
:root[data-theme="dark"]{--ground:#0d0f15;--surface:#161a23;--surface-2:#1d222d;--ink:#e8eaf0;--ink-soft:#c2c7d2;--muted:#8b93a4;--line:#262c38;--line-strong:#333b49;--accent:#2ec5da;--accent-ink:#7fe0ee;--accent-soft:#10333c;--good:#3ec76f;--good-soft:#12291c;--good-line:#1f4d31;--bad:#ff5c7c;--bad-soft:#2c141c;--bad-line:#522633}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 1}
.wrap{max-width:940px;margin:0 auto;padding:clamp(20px,4vw,44px) clamp(16px,4vw,32px) 64px}
.masthead{display:flex;flex-wrap:wrap;gap:16px 24px;align-items:flex-start;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:baseline;gap:10px}
.wordmark{font-family:var(--mono);font-weight:700;font-size:1.15rem;letter-spacing:-.02em}
.wordmark .dim{color:var(--accent)}
.tag{font-size:.66rem;text-transform:uppercase;letter-spacing:.13em;font-weight:600;color:var(--muted);border:1px solid var(--line-strong);padding:2px 7px;border-radius:999px;transform:translateY(-1px)}
.verdict{display:inline-flex;align-items:center;gap:9px;font-weight:650;font-size:.92rem;padding:8px 15px;border-radius:999px}
.verdict.good{background:var(--good-soft);color:var(--good);border:1px solid var(--good-line)}
.verdict.bad{background:var(--bad-soft);color:var(--bad);border:1px solid var(--bad-line)}
.verdict .dot{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 22%,transparent)}
.verdict small{display:block;font-size:.58rem;line-height:1.2;text-transform:uppercase;letter-spacing:.12em;opacity:.72;margin-bottom:2px}
.subhead{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:18px;font-size:.82rem;color:var(--muted)}
.subhead b{color:var(--ink-soft);font-weight:600}
.compare{display:inline-flex;align-items:center;gap:9px;font-family:var(--mono);font-size:.82rem;margin-top:22px;padding:7px 13px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);box-shadow:var(--shadow);max-width:100%;overflow-x:auto}
.compare .side{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.compare .lab{color:var(--muted);font-family:var(--sans);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}
.compare .arrow{color:var(--accent);font-weight:700}
section{margin-top:40px}
.eyebrow{font-size:.7rem;text-transform:uppercase;letter-spacing:.14em;font-weight:700;color:var(--muted);margin:0 0 16px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:14px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 17px 17px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:4px;min-width:0}
.tile .k{font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600}
.tile .v{font-size:1.7rem;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:8px}
.tile .v.bad-v{color:var(--bad)}
.tile .v .from{color:var(--muted);font-size:1.05rem;font-weight:600}
.tile .v .to-up{color:var(--good)}
.tile .v .to-down{color:var(--bad)}
.tile .v .unavailable{font-size:1rem;color:var(--muted);font-weight:600}
.tile .delta{font-size:.78rem;font-weight:650;font-variant-numeric:tabular-nums}
.delta.up{color:var(--good)}
.delta.down{color:var(--bad)}
.delta.flat{color:var(--muted)}
.section-title-row{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:16px}.section-title-row .eyebrow{margin:0}.coverage{font-size:.72rem;color:var(--muted);text-align:right}.usage-tiles{grid-template-columns:repeat(auto-fit,minmax(205px,1fr))}.scenario{border-color:var(--accent);background:var(--accent-soft)}.assumption{margin:10px 0 0;color:var(--muted);font-size:.75rem}.assumption code{font-family:var(--mono);color:var(--ink-soft)}
.bar{height:6px;border-radius:999px;background:var(--surface-2);overflow:hidden;margin-top:8px}
.bar>i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--good),color-mix(in srgb,var(--good) 60%,var(--accent)));width:var(--fill,0%);animation:grow 1s cubic-bezier(.22,.61,.36,1) both}
.bar>i.neg{background:linear-gradient(90deg,var(--bad),color-mix(in srgb,var(--bad) 60%,var(--accent)))}
@keyframes grow{from{width:0}}
.chip-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.chip-lead{font-size:.8rem;color:var(--muted);margin-right:4px}
.chip{font-family:var(--mono);font-size:.77rem;padding:4px 10px;border-radius:999px;font-weight:600;border:1px solid transparent}
.chip.good{background:var(--good-soft);color:var(--good);border-color:var(--good-line)}
.chip.bad{background:var(--bad-soft);color:var(--bad);border-color:var(--bad-line)}
.chip.none{background:var(--surface-2);color:var(--muted);font-family:var(--sans)}
.scroll{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--line);box-shadow:var(--shadow)}
table{border-collapse:collapse;width:100%;background:var(--surface);font-size:.85rem}
th,td{text-align:left;padding:11px 14px;white-space:nowrap}
thead th{font-size:.68rem;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:700;background:var(--surface-2);border-bottom:1px solid var(--line)}
tbody tr+tr td{border-top:1px solid var(--line)}
td.mono,th.mono{font-family:var(--mono)}
.state{font-family:var(--mono);font-weight:600;font-size:.8rem}
.state.pass{color:var(--good)}
.state.fail{color:var(--bad)}
.flip{color:var(--muted);padding:0 4px}
.case{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;margin-bottom:18px}
.case-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}
.case-id{font-family:var(--mono);font-weight:700;font-size:.92rem}
.pill{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;padding:3px 9px;border-radius:999px}
.pill.pass{background:var(--good-soft);color:var(--good);border:1px solid var(--good-line)}
.pill.fail{background:var(--bad-soft);color:var(--bad);border:1px solid var(--bad-line)}
.pill.neutral{background:var(--surface-2);color:var(--muted)}
.case-input{padding:12px 18px;font-size:.82rem;color:var(--ink-soft);background:var(--surface-2);border-bottom:1px solid var(--line)}
.case-input .lab{color:var(--muted);text-transform:uppercase;letter-spacing:.09em;font-size:.66rem;font-weight:700;margin-right:8px}
.case-input .q{font-family:var(--mono)}
.io{display:grid;grid-template-columns:1fr 1fr}
.io>div{padding:14px 18px;min-width:0}
.io>div:first-child{border-right:1px solid var(--line)}
.io .side-lab{display:flex;align-items:center;gap:8px;font-size:.68rem;text-transform:uppercase;letter-spacing:.09em;font-weight:700;margin-bottom:9px}
.io .side-lab .run{font-family:var(--mono);color:var(--muted);font-weight:500;letter-spacing:0;text-transform:none}
.io .before .side-lab{color:var(--bad)}
.io .after .side-lab{color:var(--good)}
.out{font-family:var(--mono);font-size:.8rem;line-height:1.6;padding:11px 12px;border-radius:var(--radius-sm);border:1px solid var(--line);white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.before .out{background:var(--bad-soft);border-color:var(--bad-line)}
.after .out{background:var(--good-soft);border-color:var(--good-line)}
.asserts{padding:6px 18px 16px}.target-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:8px 18px}.trace{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.trace>div{padding:14px 18px}.trace>div:first-child{border-right:1px solid var(--line)}.trace-step{display:flex;flex-direction:column;gap:3px;margin:8px 0;padding:9px 10px;background:var(--surface-2);border-radius:var(--radius-sm);font-family:var(--mono);font-size:.75rem}.trace-step span{color:var(--muted);overflow-wrap:anywhere}
.trace-aligned{border-top:1px solid var(--line);padding:10px 18px 16px}
.trace-head,.trace-row{display:grid;grid-template-columns:28px 1fr 1fr;gap:10px;align-items:stretch}
.trace-head .side-lab{padding:6px 0}
.trace-n{font-family:var(--mono);font-size:.7rem;color:var(--muted);display:flex;align-items:center;justify-content:center}
.trace-row{border-left:3px solid transparent;border-radius:var(--radius-sm)}
.trace-row.changed{border-left-color:var(--warn,#b58900);background:color-mix(in srgb,var(--warn,#b58900) 6%,transparent)}
.trace-row.added{border-left-color:var(--good,#2ea043);background:color-mix(in srgb,var(--good,#2ea043) 6%,transparent)}
.trace-row.removed{border-left-color:var(--bad,#d1242f);background:color-mix(in srgb,var(--bad,#d1242f) 6%,transparent)}
.trace-row .empty{color:var(--muted);font-family:var(--mono);font-size:.75rem;display:flex;align-items:center;padding:9px 10px}
.violations .row{border-left:3px solid var(--bad,#d1242f);padding-left:9px}
.violations .aval.grow{flex:1;color:var(--muted)}
.asserts .row{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:.82rem;border-top:1px solid var(--line)}
.asserts .row:first-child{border-top:none}
.asserts .atype{font-family:var(--mono);font-weight:600}
.asserts .aval{color:var(--muted);font-family:var(--mono);font-size:.76rem}
.asserts .transition{margin-left:auto;display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:.78rem}
.tk{padding:1px 7px;border-radius:5px;font-weight:600}
.tk.pass{background:var(--good-soft);color:var(--good)}
.tk.fail{background:var(--bad-soft);color:var(--bad)}
.tk.flat{background:var(--surface-2);color:var(--muted)}
.empty{color:var(--muted);font-size:.9rem;padding:14px 0}
footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;font-size:.78rem;color:var(--muted)}
footer .local{display:inline-flex;align-items:center;gap:7px;color:var(--ink-soft);font-weight:600}
footer .local .dot{width:7px;height:7px;border-radius:50%;background:var(--accent)}
footer .mono{font-family:var(--mono)}
footer .spacer{margin-left:auto}
a{color:var(--accent-ink)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
@media (prefers-reduced-motion:reduce){.bar>i{animation:none}}
@media (max-width:560px){.section-title-row{align-items:flex-start;flex-direction:column}.coverage{text-align:left}.io,.trace{grid-template-columns:1fr}.trace>div:first-child{border-right:none;border-bottom:1px solid var(--line)}.io{grid-template-columns:1fr}.io>div:first-child{border-right:none;border-bottom:1px solid var(--line)}}
`;
