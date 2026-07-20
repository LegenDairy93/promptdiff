import type { AgentTraceStep, RunArtifact } from "../src/artifacts/types.js";

type ArtifactCase = RunArtifact["cases"][number];

/** `["id", passed]` for the common case, or a partial case object to override anything. */
export type CaseSpec = [id: string, passed: boolean] | ({ id: string; passed: boolean } & Partial<ArtifactCase>);

export function traceStep(type: AgentTraceStep["type"], name?: string, io?: { input?: unknown; output?: unknown }): AgentTraceStep {
  return { type, ...(name ? { name } : {}), ...io };
}

/** Legacy v0.1 artifact: carries `prompt`, no `target`. Kept deliberately — it is the getArtifactTarget regression test. */
export function legacyArtifact(runId: string, label: string, cases: CaseSpec[]): RunArtifact {
  return { ...base(runId, cases), prompt: { label, path: `${label}.md`, sha256: "hash" } };
}

/** Modern prompt-target artifact. */
export function runArtifact(runId: string, label: string, cases: CaseSpec[]): RunArtifact {
  return { ...base(runId, cases), target: { kind: "prompt", label, path: `${label}.md`, sha256: "hash" } };
}

/** Modern agent-target artifact. Pass tool names as strings; `toolDecls` is derived unless overridden. */
export function agentArtifact(
  runId: string,
  label: string,
  cases: CaseSpec[],
  options: { tools?: string[]; toolDecls?: NonNullable<RunArtifact["target"]>["toolDecls"]; command?: string[] } = {}
): RunArtifact {
  const tools = options.tools ?? [];
  return {
    ...base(runId, cases),
    provider: { type: "command" },
    target: {
      kind: "agent",
      label,
      sha256: "agent-hash",
      tools,
      toolDecls: options.toolDecls ?? tools.map((name) => ({ name })),
      command: options.command ?? ["node", "agent.mjs"]
    }
  };
}

function base(runId: string, specs: CaseSpec[]): Omit<RunArtifact, "target" | "prompt"> {
  const cases = specs.map(toCase);
  const passed = cases.filter((testCase) => testCase.passed).length;
  return {
    runId,
    project: "demo",
    createdAt: new Date().toISOString(),
    provider: { type: "mock", model: "mock-v1", temperature: 0 },
    summary: { total: cases.length, passed, failed: cases.length - passed },
    cases
  };
}

function toCase(spec: CaseSpec): ArtifactCase {
  const overrides = Array.isArray(spec) ? { id: spec[0], passed: spec[1] } : spec;
  return {
    input: `input for ${overrides.id}`,
    output: overrides.passed ? "pass" : "fail",
    assertions: [{ type: "contains", passed: overrides.passed, expected: "ok" }],
    ...overrides
  };
}
