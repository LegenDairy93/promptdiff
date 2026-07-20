import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateAssertion } from "../assertions/evaluateAssertion.js";
import type { LoadedConfig, TargetConfig } from "../config/schema.js";
import { sha256 } from "../artifacts/hash.js";
import type { RunArtifact } from "../artifacts/types.js";
import { writeRun, type WriteRunResult } from "../artifacts/writeRun.js";
import { createProvider } from "../providers/createProvider.js";
import { runAgentCommand } from "./runAgent.js";
import { validateTrace } from "./validateTrace.js";
import { renderPrompt } from "./renderPrompt.js";

export type RunSuiteOptions = { targetLabel?: string; promptLabel?: string; artifactRoot?: string };
type ResolvedTarget = { label: string; config: TargetConfig };

export async function runSuite(loadedConfig: LoadedConfig, options: RunSuiteOptions = {}): Promise<WriteRunResult> {
  const { config } = loadedConfig;
  const targets = normalizedTargets(loadedConfig);
  const targetLabel = options.targetLabel ?? options.promptLabel ?? chooseDefaultTarget(Object.keys(targets));
  const targetConfig = targets[targetLabel];
  if (!targetConfig) throw new Error(`Target "${targetLabel}" is not configured. Available targets: ${Object.keys(targets).join(", ")}`);

  const resolved: ResolvedTarget = { label: targetLabel, config: targetConfig };
  const provider = targetConfig.kind === "prompt" ? createProvider(config.provider) : undefined;
  const promptPath = targetConfig.kind === "prompt" ? path.resolve(loadedConfig.rootDir, targetConfig.file) : undefined;
  const instructionsPath = targetConfig.kind === "agent" && targetConfig.instructions ? path.resolve(loadedConfig.rootDir, targetConfig.instructions) : undefined;
  const instructions = instructionsPath ? await readFile(instructionsPath, "utf8") : undefined;
  const prompt = promptPath ? await readFile(promptPath, "utf8") : undefined;
  const cases: RunArtifact["cases"] = [];

  for (const testCase of config.cases) {
    const result = resolved.config.kind === "prompt"
      ? await provider!.run({ prompt: renderPrompt(prompt!, testCase), input: testCase.input, variables: testCase.variables, model: config.provider.model, temperature: config.provider.temperature })
      : await runAgentCommand({ command: resolved.config.command, cwd: loadedConfig.rootDir, timeoutMs: resolved.config.timeout_ms, label: resolved.label, instructions, tools: resolved.config.tools, testCase });
    const output = "text" in result ? result.text : result.output;
    // Trace and violations must exist before assertions run — trace assertions read them.
    const trace = "trace" in result ? result.trace : undefined;
    const declaredTools = resolved.config.kind === "agent" ? resolved.config.tools : undefined;
    const violations = "trace" in result
      ? validateTrace({ steps: result.trace, indices: result.indices, declarations: declaredTools ?? [], malformed: result.malformed })
      : undefined;
    const assertions = testCase.assertions.map((assertion) => evaluateAssertion(assertion, { output, trace, violations, declaredTools }));
    cases.push({
      id: testCase.id, input: testCase.input, output, passed: assertions.every((a) => a.passed), assertions,
      usage: result.usage, trace,
      violations: violations?.length ? violations : undefined
    });
  }

  const passed = cases.filter((testCase) => testCase.passed).length;
  const identity = targetConfig.kind === "prompt" ? prompt! : JSON.stringify({ instructions: instructions ?? null, tools: targetConfig.tools, command: targetConfig.command });
  const artifact: RunArtifact = {
    runId: createRunId(), project: config.project, createdAt: new Date().toISOString(),
    provider: targetConfig.kind === "prompt" ? { type: config.provider.type, model: config.provider.model, temperature: config.provider.temperature } : { type: "command" },
    target: {
      kind: targetConfig.kind, label: targetLabel,
      path: toPortablePath(path.relative(options.artifactRoot ?? process.cwd(), (promptPath ?? instructionsPath) || loadedConfig.path)),
      sha256: sha256(identity),
      tools: targetConfig.kind === "agent" ? targetConfig.tools.map((tool) => tool.name) : undefined,
      toolDecls: targetConfig.kind === "agent" ? targetConfig.tools : undefined,
      command: targetConfig.kind === "agent" ? targetConfig.command : undefined
    },
    summary: { total: cases.length, passed, failed: cases.length - passed }, cases
  };
  return writeRun(artifact, options.artifactRoot);
}

function normalizedTargets(loaded: LoadedConfig): Record<string, TargetConfig> {
  if (loaded.config.targets) return loaded.config.targets;
  return Object.fromEntries(Object.entries(loaded.config.prompts ?? {}).map(([label, file]) => [label, { kind: "prompt", file }]));
}
function chooseDefaultTarget(labels: string[]): string {
  for (const preferred of ["candidate", "agent", "baseline"]) if (labels.includes(preferred)) return preferred;
  if (!labels[0]) throw new Error("No targets configured");
  return labels[0];
}
function createRunId(): string { return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`; }
function toPortablePath(filePath: string): string { return filePath.split(path.sep).join("/"); }
