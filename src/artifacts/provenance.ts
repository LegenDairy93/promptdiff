import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { RunProvenance } from "./types.js";
import { VERSION } from "../version.js";

const execFileAsync = promisify(execFile);

export async function collectProvenance(options: {
  cwd: string;
  configPath: string;
  artifactRoot: string;
}): Promise<RunProvenance> {
  const [commit, branch, status] = await Promise.all([
    git(["rev-parse", "HEAD"], options.cwd),
    git(["rev-parse", "--abbrev-ref", "HEAD"], options.cwd),
    git(["status", "--porcelain"], options.cwd)
  ]);
  const gitData = commit || branch || status !== undefined
    ? {
        ...(commit ? { commit } : {}),
        ...(branch ? { branch } : {}),
        ...(status !== undefined ? { dirty: status.length > 0 } : {})
      }
    : undefined;
  const ci = githubActionsProvenance();

  return {
    promptdiffVersion: VERSION,
    configPath: portable(path.relative(options.artifactRoot, options.configPath)),
    ...(gitData ? { git: gitData } : {}),
    ...(ci ? { ci } : {})
  };
}

async function git(args: string[], cwd: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", args, { cwd, windowsHide: true });
    return result.stdout.trim();
  } catch {
    return undefined;
  }
}

function githubActionsProvenance(): RunProvenance["ci"] | undefined {
  if (process.env.GITHUB_ACTIONS !== "true") return undefined;
  const pullRequest = process.env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//)?.[1];
  return {
    provider: "github-actions",
    ...(process.env.GITHUB_RUN_ID ? { runId: process.env.GITHUB_RUN_ID } : {}),
    ...(process.env.GITHUB_JOB ? { job: process.env.GITHUB_JOB } : {}),
    ...(process.env.GITHUB_EVENT_NAME ? { event: process.env.GITHUB_EVENT_NAME } : {}),
    ...(process.env.GITHUB_REF_NAME ? { ref: process.env.GITHUB_REF_NAME } : {}),
    ...(process.env.GITHUB_SHA ? { commit: process.env.GITHUB_SHA } : {}),
    ...(pullRequest ? { pullRequest } : {})
  };
}

function portable(value: string): string {
  return value.split(path.sep).join("/");
}
