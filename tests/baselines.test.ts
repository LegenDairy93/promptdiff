import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRun } from "../src/artifacts/readRun.js";
import { writeRun } from "../src/artifacts/writeRun.js";
import type { RunArtifact } from "../src/artifacts/types.js";
import {
  listBaselines,
  listPromotionHistory,
  promoteBaseline,
  readBaseline,
  validateBaselineName
} from "../src/baselines/registry.js";

describe("behavioral baseline registry", () => {
  it("promotes a run and resolves it through baseline:<name>", async () => {
    const root = await makeTempDir();
    const written = await writeRun(artifact("run-a", "candidate"), root);

    const promoted = await promoteBaseline(written, {
      artifactRoot: root,
      name: "production",
      actor: "reviewer@example.com",
      reason: "Approved in PR #42"
    });

    expect(promoted).toMatchObject({
      name: "production",
      runId: "run-a",
      actor: "reviewer@example.com",
      reason: "Approved in PR #42"
    });
    await expect(resolveRun("baseline:production", root)).resolves.toMatchObject({
      artifact: { runId: "run-a" }
    });
    await expect(listBaselines(root)).resolves.toHaveLength(1);
  });

  it("preserves an append-only record when a baseline is replaced", async () => {
    const root = await makeTempDir();
    const first = await writeRun(artifact("run-a", "candidate-a"), root);
    const second = await writeRun(artifact("run-b", "candidate-b"), root);

    await promoteBaseline(first, { artifactRoot: root, name: "production" });
    await promoteBaseline(second, { artifactRoot: root, name: "production" });

    expect((await readBaseline("production", root)).runId).toBe("run-b");
    const history = await listPromotionHistory(root, "production");
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ runId: "run-b", previousRunId: "run-a" });
    expect(history[1]).toMatchObject({ runId: "run-a" });
  });

  it("rejects modified baseline snapshots", async () => {
    const root = await makeTempDir();
    const written = await writeRun(artifact("run-a", "candidate"), root);
    await promoteBaseline(written, { artifactRoot: root, name: "production" });

    const baselinePath = path.join(root, ".promptdiff", "baselines", "production.json");
    const record = JSON.parse(await readFile(baselinePath, "utf8"));
    record.artifact.cases[0].output = "tampered";
    await writeFile(baselinePath, JSON.stringify(record), "utf8");

    await expect(readBaseline("production", root)).rejects.toThrow("integrity verification");
  });

  it("rejects names that could escape the registry", () => {
    expect(() => validateBaselineName("../production")).toThrow("Invalid baseline name");
    expect(() => validateBaselineName("Production")).toThrow("lowercase");
    expect(validateBaselineName("release-2026.07")).toBe("release-2026.07");
  });
});

function artifact(runId: string, label: string): RunArtifact {
  return {
    schemaVersion: 1,
    runId,
    project: "support-agent",
    createdAt: new Date().toISOString(),
    provider: { type: "mock", model: "mock-v1" },
    target: { kind: "agent", label, sha256: `${runId}-hash`, tools: [] },
    summary: { total: 1, passed: 1, failed: 0 },
    cases: [{
      id: "refund",
      input: "Can I get a refund?",
      output: "Please check the refund policy.",
      passed: true,
      assertions: [{ type: "contains", passed: true, expected: "refund" }],
      trace: [{ type: "final", output: "Please check the refund policy." }]
    }]
  };
}

async function makeTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `promptdiff-baselines-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
