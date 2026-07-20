import type { AssertionResult } from "../assertions/types.js";

export type AgentTraceStep = {
  type: "model" | "tool" | "final";
  name?: string;
  input?: unknown;
  output?: unknown;
};

export type RunArtifact = {
  runId: string;
  project: string;
  createdAt: string;
  provider: { type: string; model?: string; temperature?: number };
  target?: {
    kind: "prompt" | "agent";
    label: string;
    path?: string;
    sha256: string;
    tools?: string[];
    command?: string[];
  };
  /** Legacy v0.1 artifact field. New artifacts use target. */
  prompt?: { label: string; path: string; sha256: string };
  summary: { total: number; passed: number; failed: number };
  cases: Array<{
    id: string;
    input: string;
    output: string;
    passed: boolean;
    assertions: AssertionResult[];
    usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
    trace?: AgentTraceStep[];
  }>;
};

export type ArtifactTarget = NonNullable<RunArtifact["target"]>;

export function getArtifactTarget(artifact: RunArtifact): ArtifactTarget {
  if (artifact.target) return artifact.target;
  if (artifact.prompt) return { kind: "prompt", ...artifact.prompt };
  throw new Error(`Run artifact ${artifact.runId} has no target metadata`);
}
