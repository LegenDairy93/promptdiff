import type { AssertionResult } from "../assertions/types.js";
import type { RunArtifact } from "../artifacts/types.js";

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
  regressionCount: number;
};

export function diffRuns(left: RunArtifact, right: RunArtifact): RunDiff {
  const leftCases = new Map(left.cases.map((testCase) => [testCase.id, testCase]));
  const rightCases = new Map(right.cases.map((testCase) => [testCase.id, testCase]));
  const caseIds = Array.from(new Set([...leftCases.keys(), ...rightCases.keys()])).sort();
  const newlyPassing: string[] = [];
  const newlyFailing: string[] = [];
  const assertionChanges: AssertionChange[] = [];
  const outputChanges: OutputChange[] = [];
  const regressedCaseIds = new Set<string>();

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
    regressionCount: regressedCaseIds.size
  };
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
