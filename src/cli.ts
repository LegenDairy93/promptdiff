#!/usr/bin/env node
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { listRuns, resolveRun } from "./artifacts/readRun.js";
import { getArtifactTarget } from "./artifacts/types.js";
import { loadConfig, ConfigError } from "./config/loadConfig.js";
import { diffRuns } from "./diff/diffRuns.js";
import { formatDiff } from "./diff/formatDiff.js";
import { formatReport } from "./diff/formatReport.js";
import { formatTable } from "./output/table.js";
import { runSuite } from "./runner/runSuite.js";

const program = new Command();

program
  .name("promptdiff")
  .description("Review behavioral changes in prompts and agents.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a starter promptdiff config and prompt files")
  .option("-f, --force", "overwrite starter files if they already exist")
  .action(async (options: { force?: boolean }) => {
    await withCliErrors(async () => {
      await initProject(Boolean(options.force));
      console.log("Created promptdiff starter files.");
    });
  });

program
  .command("run")
  .description("Run cases against a prompt or agent target and write a local artifact")
  .option("-c, --config <path>", "config file path", "promptdiff.config.yml")
  .option("-t, --target <label>", "prompt or agent target to run")
  .option("-p, --prompt <label>", "deprecated alias for --target")
  .option("--fail-on-failed-cases", "exit 1 when any case fails")
  .action(async (options: { config: string; target?: string; prompt?: string; failOnFailedCases?: boolean }) => {
    await withCliErrors(async () => {
      const loaded = await loadConfig(options.config);
      const result = await runSuite(loaded, { targetLabel: options.target ?? options.prompt });
      const target = getArtifactTarget(result.artifact);
      const rows = [
        ["Run ID", "Kind", "Target", "Passed", "Failed", "Artifact"],
        [
          result.artifact.runId,
          target.kind,
          target.label,
          String(result.artifact.summary.passed),
          String(result.artifact.summary.failed),
          path.relative(process.cwd(), result.path)
        ]
      ];

      console.log(formatTable(rows));
      if (options.failOnFailedCases && result.artifact.summary.failed > 0) {
        process.exitCode = 1;
      }
    });
  });

program
  .command("diff")
  .description("Compare two run artifacts")
  .argument("<left>", "left run ID, file path, target label, latest, or previous")
  .argument("<right>", "right run ID, file path, target label, latest, or previous")
  .option("--max-regressions <count>", "allowed regression count before exit 1", parseInteger, 0)
  .action(async (leftRef: string, rightRef: string, options: { maxRegressions: number }) => {
    await withCliErrors(async () => {
      const left = await resolveRun(leftRef);
      const right = await resolveRun(rightRef);
      const diff = diffRuns(left.artifact, right.artifact);

      console.log(formatDiff(diff));
      if (diff.regressionCount > options.maxRegressions) {
        process.exitCode = 1;
      }
    });
  });

program
  .command("report")
  .description("Write a self-contained HTML diff report from two run artifacts")
  .argument("<left>", "left run ID, file path, target label, latest, or previous")
  .argument("<right>", "right run ID, file path, target label, latest, or previous")
  .option("-o, --output <path>", "output HTML file path", "promptdiff-report.html")
  .option("--max-regressions <count>", "allowed regression count before the report reads Blocked", parseInteger, 0)
  .action(async (leftRef: string, rightRef: string, options: { output: string; maxRegressions: number }) => {
    await withCliErrors(async () => {
      const left = await resolveRun(leftRef);
      const right = await resolveRun(rightRef);
      const diff = diffRuns(left.artifact, right.artifact);
      const html = formatReport(diff, left.artifact, right.artifact, {
        maxRegressions: options.maxRegressions
      });

      await writeFile(options.output, html, "utf8");
      console.log(`Wrote report to ${path.relative(process.cwd(), path.resolve(options.output))}`);
    });
  });

program
  .command("list")
  .description("List local run artifacts")
  .action(async () => {
    await withCliErrors(async () => {
      const runs = await listRuns();
      if (runs.length === 0) {
        console.log("No run artifacts found.");
        return;
      }

      console.log(formatTable([
        ["Run ID", "Created", "Project", "Kind", "Target", "Passed", "Failed"],
        ...runs.map((run) => [
          run.artifact.runId,
          run.artifact.createdAt,
          run.artifact.project,
          getArtifactTarget(run.artifact).kind,
          getArtifactTarget(run.artifact).label,
          String(run.artifact.summary.passed),
          String(run.artifact.summary.failed)
        ])
      ]));
    });
  });

program
  .command("show")
  .description("Show a run artifact summary")
  .argument("<run>", "run ID, file path, target label, latest, or previous")
  .option("--json", "print the raw JSON artifact")
  .action(async (runRef: string, options: { json?: boolean }) => {
    await withCliErrors(async () => {
      const run = await resolveRun(runRef);
      if (options.json) {
        console.log(JSON.stringify(run.artifact, null, 2));
        return;
      }

      console.log(formatTable([
        ["Run ID", "Project", "Kind", "Target", "Passed", "Failed"],
        [
          run.artifact.runId,
          run.artifact.project,
          getArtifactTarget(run.artifact).kind,
          getArtifactTarget(run.artifact).label,
          String(run.artifact.summary.passed),
          String(run.artifact.summary.failed)
        ]
      ]));
      console.log("");
      console.log(formatTable([
        ["Case", "Result", "Output chars"],
        ...run.artifact.cases.map((testCase) => [
          testCase.id,
          testCase.passed ? "pass" : "fail",
          String(testCase.output.length)
        ])
      ]));
    });
  });

await program.parseAsync(process.argv);

async function initProject(force: boolean): Promise<void> {
  await mkdir("prompts", { recursive: true });
  await writeStarterFile("promptdiff.config.yml", starterConfig(), force);
  await writeStarterFile(path.join("prompts", "support-v1.md"), starterPromptV1(), force);
  await writeStarterFile(path.join("prompts", "support-v2.md"), starterPromptV2(), force);
  await ensureGitignoreEntry(".promptdiff/");
}

async function writeStarterFile(filePath: string, contents: string, force: boolean): Promise<void> {
  if (existsSync(filePath) && !force) {
    return;
  }
  await writeFile(filePath, contents, "utf8");
}

async function ensureGitignoreEntry(entry: string): Promise<void> {
  const gitignorePath = ".gitignore";
  if (!existsSync(gitignorePath)) {
    await writeFile(gitignorePath, `${entry}\n`, "utf8");
    return;
  }

  const text = await import("node:fs/promises").then((fs) => fs.readFile(gitignorePath, "utf8"));
  if (!text.split(/\r?\n/).includes(entry)) {
    await appendFile(gitignorePath, `${text.endsWith("\n") ? "" : "\n"}${entry}\n`, "utf8");
  }
}

function starterConfig(): string {
  return `project: support-bot-prompt-regression

targets:
  baseline:
    kind: prompt
    file: prompts/support-v1.md
  candidate:
    kind: prompt
    file: prompts/support-v2.md

provider:
  type: mock
  model: mock-v1
  temperature: 0

cases:
  - id: refund-policy
    input: "Can I get a refund after 40 days?"
    assertions:
      - type: contains
        value: "refund"
      - type: not_contains
        value: "guaranteed"
      - type: max_length
        value: 1200

  - id: json-output
    input: "Classify this ticket: I was charged twice."
    assertions:
      - type: json_schema
        schema:
          type: object
          required: ["category", "priority"]
          properties:
            category:
              type: string
            priority:
              type: string
              enum: ["low", "medium", "high"]
`;
}

function starterPromptV1(): string {
  return `You are a support assistant.

Answer directly and confidently.
`;
}

function starterPromptV2(): string {
  return `You are a support assistant.

Avoid guarantees. Use the word refund when answering refund questions.
For classification requests, return JSON with category and priority.
`;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received ${value}`);
  }
  return parsed;
}

async function withCliErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = error instanceof ConfigError ? 2 : 2;
  }
}
