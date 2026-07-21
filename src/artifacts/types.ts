import type { AssertionResult } from "../assertions/types.js";

export type AgentTraceStep = {
  type: "model" | "tool" | "final";
  name?: string;
  input?: unknown;
  output?: unknown;
};

/** A tool the target declared it may call. `effect` drives severity ranking in diff/report. */
export type ArtifactToolDeclaration = {
  name: string;
  description?: string;
  args_schema?: Record<string, unknown>;
  effect?: "read" | "write" | "external";
};

/** A policy problem found in an agent's trace. Recorded on the case; never flips `passed` implicitly. */
export type ToolViolation = {
  kind: "undeclared_tool" | "invalid_args" | "malformed_step" | "missing_tool_name";
  /** Index into the raw trace array as emitted by the agent. */
  step: number;
  tool?: string;
  message: string;
};

export type RunProvenance = {
  promptdiffVersion: string;
  configPath?: string;
  git?: {
    commit?: string;
    branch?: string;
    dirty?: boolean;
  };
  ci?: {
    provider: "github-actions";
    runId?: string;
    job?: string;
    event?: string;
    ref?: string;
    commit?: string;
    pullRequest?: string;
  };
};

export type RunArtifact = {
  /** Artifact schema version. Missing means a v0.1/v0.2 artifact. */
  schemaVersion?: 1;
  runId: string;
  project: string;
  createdAt: string;
  provider: { type: string; model?: string; temperature?: number };
  provenance?: RunProvenance;
  target?: {
    kind: "prompt" | "agent";
    label: string;
    path?: string;
    sha256: string;
    /** Tool names only. Kept as string[] for v0.1 read-compat; see toolDecls for the full declarations. */
    tools?: string[];
    toolDecls?: ArtifactToolDeclaration[];
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
    /** Present only when non-empty, so clean runs stay shape-identical to v0.1. */
    violations?: ToolViolation[];
  }>;
};

export type ArtifactTarget = NonNullable<RunArtifact["target"]>;

export function getArtifactTarget(artifact: RunArtifact): ArtifactTarget {
  if (artifact.target) return artifact.target;
  if (artifact.prompt) return { kind: "prompt", ...artifact.prompt };
  throw new Error(`Run artifact ${artifact.runId} has no target metadata`);
}

/** Full tool declarations, upconverting v0.1 targets that only carry names. */
export function getArtifactToolDecls(target: ArtifactTarget): ArtifactToolDeclaration[] {
  return target.toolDecls ?? (target.tools ?? []).map((name) => ({ name }));
}
