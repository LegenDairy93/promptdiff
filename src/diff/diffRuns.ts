import type { AssertionResult } from "../assertions/types.js";
import { getArtifactTarget, getArtifactToolDecls, type RunArtifact, type ToolViolation } from "../artifacts/types.js";
import { toolUsage } from "./toolUsage.js";

export type AssertionChange = {
  caseId: string;
  assertionIndex: number;
  type: string;
  leftPassed: boolean;
  rightPassed: boolean;
  leftMessage?: string;
  rightMessage?: string;
};

export type OutputChange = {
  caseId: string;
  leftLength: number;
  rightLength: number;
  leftSnippet: string;
  rightSnippet: string;
};
export type ModelChange = {
  caseId: string;
  step: number | "response";
  left: string;
  right: string;
};

/**
 * How alarming a tool change is. Drives ordering and truncation so a dangerous change is
 * never buried under benign ones — the safeguard that makes the informational default safe.
 */
export type ToolSeverity = "violation" | "effect" | "drift" | "count";

export const TOOL_SEVERITY_ORDER: ToolSeverity[] = ["violation", "effect", "drift", "count"];

export type ToolChange = {
  caseId: string;
  name: string;
  leftCalls: number;
  rightCalls: number;
  status: "added" | "removed" | "count_changed";
  severity: ToolSeverity;
  /** Declared effect of the tool on the right-hand run, when known. */
  effect?: "read" | "write" | "external";
};

export type ViolationChange = {
  caseId: string;
  kind: ToolViolation["kind"];
  leftCount: number;
  rightCount: number;
  tools: string[];
};

/** Both default to false: tool drift is reported but does not gate CI unless asked. */
export type DiffOptions = { gateToolDrift?: boolean; gateCallDeltas?: boolean };

export type RunDiff = {
  leftRunId: string;
  rightRunId: string;
  leftPassRate: number;
  rightPassRate: number;
  passRateDelta: number;
  newlyPassing: string[];
  newlyFailing: string[];
  assertionChanges: AssertionChange[];
  outputChanges: OutputChange[];
  modelChanges: ModelChange[];
  toolChanges: ToolChange[];
  violationChanges: ViolationChange[];
  regressionCount: number;
};

export function diffRuns(left: RunArtifact, right: RunArtifact, options: DiffOptions = {}): RunDiff {
  const leftCases = new Map(left.cases.map((testCase) => [testCase.id, testCase]));
  const rightCases = new Map(right.cases.map((testCase) => [testCase.id, testCase]));
  const caseIds = Array.from(new Set([...leftCases.keys(), ...rightCases.keys()])).sort();
  const newlyPassing: string[] = [];
  const newlyFailing: string[] = [];
  const assertionChanges: AssertionChange[] = [];
  const outputChanges: OutputChange[] = [];
  const modelChanges: ModelChange[] = [];
  const toolChanges: ToolChange[] = [];
  const violationChanges: ViolationChange[] = [];
  const regressedCaseIds = new Set<string>();
  const effects = toolEffects(right);

  for (const caseId of caseIds) {
    const leftCase = leftCases.get(caseId);
    const rightCase = rightCases.get(caseId);

    if (!leftCase || !rightCase) {
      if (leftCase && !rightCase && leftCase.passed) {
        newlyFailing.push(caseId);
        regressedCaseIds.add(caseId);
      }
      if (!leftCase && rightCase && rightCase.passed) {
        newlyPassing.push(caseId);
      }
      continue;
    }

    if (!leftCase.passed && rightCase.passed) {
      newlyPassing.push(caseId);
    }

    if (leftCase.passed && !rightCase.passed) {
      newlyFailing.push(caseId);
      regressedCaseIds.add(caseId);
    }

    collectAssertionChanges(caseId, leftCase.assertions, rightCase.assertions).forEach((change) => {
      assertionChanges.push(change);
      if (change.leftPassed && !change.rightPassed) {
        regressedCaseIds.add(caseId);
      }
    });

    if (leftCase.output !== rightCase.output) {
      outputChanges.push({
        caseId,
        leftLength: leftCase.output.length,
        rightLength: rightCase.output.length,
        leftSnippet: snippet(leftCase.output),
        rightSnippet: snippet(rightCase.output)
      });
    }
    modelChanges.push(...collectModelChanges(caseId, leftCase, rightCase));

    // Identical output does not mean identical behavior: compare which tools ran, and how often.
    const leftUsage = toolUsage(leftCase);
    const rightUsage = toolUsage(rightCase);
    for (const name of [...new Set([...leftUsage.keys(), ...rightUsage.keys()])].sort()) {
      const leftCalls = leftUsage.get(name) ?? 0;
      const rightCalls = rightUsage.get(name) ?? 0;
      if (leftCalls === rightCalls) continue;
      const status = leftCalls === 0 ? "added" : rightCalls === 0 ? "removed" : "count_changed";
      const effect = effects.get(name);
      const severity: ToolSeverity = status === "count_changed"
        ? "count"
        : effect === "write" || effect === "external" ? "effect" : "drift";
      toolChanges.push({ caseId, name, leftCalls, rightCalls, status, severity, effect });
      const gated = status === "count_changed" ? options.gateCallDeltas : options.gateToolDrift;
      if (gated) regressedCaseIds.add(caseId);
    }

    collectViolationChanges(caseId, leftCase.violations, rightCase.violations).forEach((change) => {
      violationChanges.push(change);
      if (options.gateToolDrift) regressedCaseIds.add(caseId);
    });
  }

  const leftPassRate = passRate(left);
  const rightPassRate = passRate(right);

  return {
    leftRunId: left.runId,
    rightRunId: right.runId,
    leftPassRate,
    rightPassRate,
    passRateDelta: rightPassRate - leftPassRate,
    newlyPassing,
    newlyFailing,
    assertionChanges,
    outputChanges,
    modelChanges,
    toolChanges: toolChanges.sort(bySeverity),
    violationChanges,
    regressionCount: regressedCaseIds.size
  };
}

function collectModelChanges(caseId: string, leftCase: RunArtifact["cases"][number], rightCase: RunArtifact["cases"][number]): ModelChange[] {
  const changes: ModelChange[] = [];
  const leftResponse = responseModelIdentity(leftCase);
  const rightResponse = responseModelIdentity(rightCase);
  if ((leftCase.execution?.model || rightCase.execution?.model) && leftResponse !== rightResponse) {
    changes.push({ caseId, step: "response", left: leftResponse, right: rightResponse });
  }
  const left = (leftCase.trace ?? []).filter((step) => step.type === "model");
  const right = (rightCase.trace ?? []).filter((step) => step.type === "model");
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftIdentity = modelIdentity(left[index]);
    const rightIdentity = modelIdentity(right[index]);
    if (leftIdentity !== rightIdentity) changes.push({ caseId, step: index + 1, left: leftIdentity, right: rightIdentity });
  }
  return changes;
}

function responseModelIdentity(testCase: RunArtifact["cases"][number]): string {
  if (!testCase.execution?.model) return "none";
  return [testCase.execution.provider, testCase.execution.model].filter(Boolean).join("/");
}

function modelIdentity(step: NonNullable<RunArtifact["cases"][number]["trace"]>[number] | undefined): string {
  if (!step) return "none";
  const identity = [step.provider, step.model].filter(Boolean).join("/");
  return identity || step.name || "unidentified model";
}
function bySeverity(left: ToolChange, right: ToolChange): number {
  const delta = TOOL_SEVERITY_ORDER.indexOf(left.severity) - TOOL_SEVERITY_ORDER.indexOf(right.severity);
  return delta !== 0 ? delta : left.caseId.localeCompare(right.caseId) || left.name.localeCompare(right.name);
}

/** Declared effects from the right-hand run, used to rank a tool change by how dangerous it is. */
function toolEffects(artifact: RunArtifact): Map<string, "read" | "write" | "external"> {
  const effects = new Map<string, "read" | "write" | "external">();
  let declarations;
  try {
    declarations = getArtifactToolDecls(getArtifactTarget(artifact));
  } catch {
    return effects;
  }
  for (const declaration of declarations) if (declaration.effect) effects.set(declaration.name, declaration.effect);
  return effects;
}

function collectViolationChanges(caseId: string, left: ToolViolation[] = [], right: ToolViolation[] = []): ViolationChange[] {
  const kinds = new Set<ToolViolation["kind"]>([...left, ...right].map((violation) => violation.kind));
  const changes: ViolationChange[] = [];
  for (const kind of kinds) {
    const leftMatches = left.filter((violation) => violation.kind === kind);
    const rightMatches = right.filter((violation) => violation.kind === kind);
    if (rightMatches.length <= leftMatches.length) continue;
    changes.push({
      caseId,
      kind,
      leftCount: leftMatches.length,
      rightCount: rightMatches.length,
      tools: [...new Set(rightMatches.map((violation) => violation.tool).filter((tool): tool is string => Boolean(tool)))]
    });
  }
  return changes;
}

function collectAssertionChanges(
  caseId: string,
  leftAssertions: AssertionResult[],
  rightAssertions: AssertionResult[]
): AssertionChange[] {
  const count = Math.max(leftAssertions.length, rightAssertions.length);
  const changes: AssertionChange[] = [];

  for (let index = 0; index < count; index += 1) {
    const leftAssertion = leftAssertions[index];
    const rightAssertion = rightAssertions[index];

    if (!leftAssertion || !rightAssertion) {
      changes.push({
        caseId,
        assertionIndex: index,
        type: leftAssertion?.type ?? rightAssertion?.type ?? "unknown",
        leftPassed: leftAssertion?.passed ?? false,
        rightPassed: rightAssertion?.passed ?? false,
        leftMessage: leftAssertion?.message,
        rightMessage: rightAssertion?.message
      });
      continue;
    }

    if (leftAssertion.passed !== rightAssertion.passed) {
      changes.push({
        caseId,
        assertionIndex: index,
        type: rightAssertion.type,
        leftPassed: leftAssertion.passed,
        rightPassed: rightAssertion.passed,
        leftMessage: leftAssertion.message,
        rightMessage: rightAssertion.message
      });
    }
  }

  return changes;
}

function passRate(artifact: RunArtifact): number {
  if (artifact.summary.total === 0) {
    return 0;
  }
  return artifact.summary.passed / artifact.summary.total;
}

function snippet(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}
