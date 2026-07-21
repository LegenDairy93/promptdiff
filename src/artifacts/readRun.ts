import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getArtifactTarget, type RunArtifact } from "./types.js";
import { readBaseline } from "../baselines/registry.js";

export type ResolvedRun = {
  artifact: RunArtifact;
  path: string;
};

export async function readRun(runPath: string): Promise<RunArtifact> {
  const text = await readFile(runPath, "utf8");
  return JSON.parse(text) as RunArtifact;
}

export async function resolveRun(ref: string, artifactRoot = process.cwd()): Promise<ResolvedRun> {
  if (ref.startsWith("baseline:")) {
    const baseline = await readBaseline(ref.slice("baseline:".length), artifactRoot);
    return {
      artifact: baseline.artifact,
      path: path.join(artifactRoot, ".promptdiff", "baselines", `${baseline.name}.json`)
    };
  }

  const runs = await listRuns(artifactRoot);
  if (runs.length === 0) {
    throw new Error(`No run artifacts found under ${path.join(artifactRoot, ".promptdiff", "runs")}`);
  }

  if (ref === "latest") {
    return runs[0];
  }

  if (ref === "previous") {
    const previous = runs[1];
    if (!previous) {
      throw new Error("No previous run artifact found");
    }
    return previous;
  }

  const directPath = path.resolve(ref);
  if (existsSync(directPath)) {
    return {
      artifact: await readRun(directPath),
      path: directPath
    };
  }

  const exactRun = runs.find((run) => run.artifact.runId === ref || `${run.artifact.runId}.json` === ref);
  if (exactRun) {
    return exactRun;
  }

  const byTargetLabel = runs.find((run) => getArtifactTarget(run.artifact).label === ref);
  if (byTargetLabel) {
    return byTargetLabel;
  }

  throw new Error(`Could not resolve run reference "${ref}". Use a run ID, path, "latest", "previous", or target label.`);
}

export async function listRuns(artifactRoot = process.cwd()): Promise<ResolvedRun[]> {
  const runsDir = path.join(artifactRoot, ".promptdiff", "runs");
  if (!existsSync(runsDir)) {
    return [];
  }

  const files = (await readdir(runsDir)).filter((file) => file.endsWith(".json"));
  const runs = await Promise.all(files.map(async (file) => {
    const filePath = path.join(runsDir, file);
    return {
      artifact: await readRun(filePath),
      path: filePath
    };
  }));

  return runs.sort((left, right) => right.artifact.createdAt.localeCompare(left.artifact.createdAt));
}
