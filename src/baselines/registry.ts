import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../artifacts/hash.js";
import type { RunArtifact } from "../artifacts/types.js";

export type BaselineRecord = {
  schemaVersion: 1;
  name: string;
  project: string;
  promotedAt: string;
  runId: string;
  artifactSha256: string;
  sourcePath?: string;
  reason?: string;
  actor?: string;
  artifact: RunArtifact;
};

export type PromotionEvent = {
  schemaVersion: 1;
  type: "baseline_promoted";
  name: string;
  project: string;
  promotedAt: string;
  runId: string;
  artifactSha256: string;
  previousRunId?: string;
  sourcePath?: string;
  reason?: string;
  actor?: string;
};

export type ResolvedArtifact = { artifact: RunArtifact; path: string };

export async function promoteBaseline(
  resolved: ResolvedArtifact,
  options: { name?: string; reason?: string; actor?: string; artifactRoot?: string } = {}
): Promise<BaselineRecord> {
  const artifactRoot = options.artifactRoot ?? process.cwd();
  const name = validateBaselineName(options.name ?? "production");
  const baselinePath = getBaselinePath(name, artifactRoot);
  const previous = existsSync(baselinePath) ? await readBaseline(name, artifactRoot) : undefined;
  if (previous && previous.project !== resolved.artifact.project) {
    throw new Error(`Baseline "${name}" belongs to project ${previous.project}, not ${resolved.artifact.project}`);
  }

  const promotedAt = new Date().toISOString();
  const artifactSha256 = hashArtifact(resolved.artifact);
  const sourcePath = portableRelative(artifactRoot, resolved.path);
  const record: BaselineRecord = {
    schemaVersion: 1,
    name,
    project: resolved.artifact.project,
    promotedAt,
    runId: resolved.artifact.runId,
    artifactSha256,
    ...(sourcePath ? { sourcePath } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.actor ? { actor: options.actor } : {}),
    artifact: resolved.artifact
  };

  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  const event: PromotionEvent = {
    schemaVersion: 1,
    type: "baseline_promoted",
    name,
    project: record.project,
    promotedAt,
    runId: record.runId,
    artifactSha256,
    ...(previous ? { previousRunId: previous.runId } : {}),
    ...(sourcePath ? { sourcePath } : {}),
    ...(record.reason ? { reason: record.reason } : {}),
    ...(record.actor ? { actor: record.actor } : {})
  };
  await appendPromotionEvent(event, artifactRoot);
  return record;
}

export async function readBaseline(name: string, artifactRoot = process.cwd()): Promise<BaselineRecord> {
  const validName = validateBaselineName(name);
  const baselinePath = getBaselinePath(validName, artifactRoot);
  let text: string;
  try {
    text = await readFile(baselinePath, "utf8");
  } catch (error) {
    if (isMissing(error)) throw new Error(`Baseline "${validName}" does not exist`);
    throw error;
  }
  const record = JSON.parse(text) as BaselineRecord;
  if (record.schemaVersion !== 1 || record.name !== validName || !record.artifact) {
    throw new Error(`Invalid baseline record at ${baselinePath}`);
  }
  if (hashArtifact(record.artifact) !== record.artifactSha256) {
    throw new Error(`Baseline "${validName}" failed integrity verification`);
  }
  return record;
}

export async function listBaselines(artifactRoot = process.cwd()): Promise<BaselineRecord[]> {
  const directory = path.join(artifactRoot, ".promptdiff", "baselines");
  if (!existsSync(directory)) return [];
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
  const records = await Promise.all(files.map((file) => readBaseline(file.slice(0, -5), artifactRoot)));
  return records.sort((left, right) => right.promotedAt.localeCompare(left.promotedAt));
}

export async function listPromotionHistory(
  artifactRoot = process.cwd(),
  baselineName?: string
): Promise<PromotionEvent[]> {
  const historyPath = path.join(artifactRoot, ".promptdiff", "history.jsonl");
  if (!existsSync(historyPath)) return [];
  const lines = (await readFile(historyPath, "utf8")).split(/\r?\n/).filter(Boolean);
  const events = lines.map((line, index) => {
    try {
      return JSON.parse(line) as PromotionEvent;
    } catch {
      throw new Error(`Invalid promotion history at line ${index + 1}`);
    }
  });
  const name = baselineName ? validateBaselineName(baselineName) : undefined;
  // The JSONL append order is authoritative. Timestamps can collide within one millisecond.
  return events
    .filter((event) => event.type === "baseline_promoted" && (!name || event.name === name))
    .reverse();
}

export function validateBaselineName(name: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) {
    throw new Error(`Invalid baseline name "${name}". Use 1-64 lowercase letters, numbers, dots, underscores, or hyphens.`);
  }
  return name;
}

function getBaselinePath(name: string, artifactRoot: string): string {
  return path.join(artifactRoot, ".promptdiff", "baselines", `${name}.json`);
}

function hashArtifact(artifact: RunArtifact): string {
  return sha256(JSON.stringify(artifact));
}

async function appendPromotionEvent(event: PromotionEvent, artifactRoot: string): Promise<void> {
  const historyPath = path.join(artifactRoot, ".promptdiff", "history.jsonl");
  await mkdir(path.dirname(historyPath), { recursive: true });
  await appendFile(historyPath, `${JSON.stringify(event)}\n`, "utf8");
}

function portableRelative(root: string, target: string): string | undefined {
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep).join("/");
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
