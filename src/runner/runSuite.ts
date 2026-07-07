import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateAssertion } from "../assertions/evaluateAssertion.js";
import type { LoadedConfig } from "../config/schema.js";
import { sha256 } from "../artifacts/hash.js";
import type { RunArtifact } from "../artifacts/types.js";
import { writeRun, type WriteRunResult } from "../artifacts/writeRun.js";
import { createProvider } from "../providers/createProvider.js";
import { renderPrompt } from "./renderPrompt.js";

export type RunSuiteOptions = {
  promptLabel?: string;
  artifactRoot?: string;
};

export async function runSuite(loadedConfig: LoadedConfig, options: RunSuiteOptions = {}): Promise<WriteRunResult> {
  const { config } = loadedConfig;
  const promptLabel = options.promptLabel ?? chooseDefaultPrompt(Object.keys(config.prompts));
  const promptConfigPath = config.prompts[promptLabel];

  if (!promptConfigPath) {
    throw new Error(`Prompt "${promptLabel}" is not configured. Available prompts: ${Object.keys(config.prompts).join(", ")}`);
  }

  const promptPath = path.resolve(loadedConfig.rootDir, promptConfigPath);
  const prompt = await readFile(promptPath, "utf8");
  const provider = createProvider(config.provider);
  const cases = [];

  for (const testCase of config.cases) {
    const renderedPrompt = renderPrompt(prompt, testCase);
    const output = await provider.run({
      prompt: renderedPrompt,
      input: testCase.input,
      variables: testCase.variables,
      model: config.provider.model,
      temperature: config.provider.temperature
    });
    const assertions = testCase.assertions.map((assertion) => evaluateAssertion(assertion, output.text));
    const passed = assertions.every((assertion) => assertion.passed);

    cases.push({
      id: testCase.id,
      input: testCase.input,
      output: output.text,
      passed,
      assertions,
      usage: output.usage
    });
  }

  const passed = cases.filter((testCase) => testCase.passed).length;
  const artifact: RunArtifact = {
    runId: createRunId(),
    project: config.project,
    createdAt: new Date().toISOString(),
    provider: {
      type: config.provider.type,
      model: config.provider.model,
      temperature: config.provider.temperature
    },
    prompt: {
      label: promptLabel,
      path: toPortablePath(path.relative(options.artifactRoot ?? process.cwd(), promptPath)),
      sha256: sha256(prompt)
    },
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed
    },
    cases
  };

  return writeRun(artifact, options.artifactRoot);
}

function chooseDefaultPrompt(labels: string[]): string {
  if (labels.includes("candidate")) {
    return "candidate";
  }

  if (labels.includes("baseline")) {
    return "baseline";
  }

  const [first] = labels;
  if (!first) {
    throw new Error("No prompts configured");
  }
  return first;
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(3).toString("hex");
  return `${timestamp}-${suffix}`;
}

function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
