import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunArtifact } from "./types.js";

export type WriteRunResult = {
  artifact: RunArtifact;
  path: string;
};

export async function writeRun(artifact: RunArtifact, artifactRoot = process.cwd()): Promise<WriteRunResult> {
  const runsDir = path.join(artifactRoot, ".promptdiff", "runs");
  await mkdir(runsDir, { recursive: true });

  const filePath = path.join(runsDir, `${artifact.runId}.json`);
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  return {
    artifact,
    path: filePath
  };
}
