import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRun } from "../src/artifacts/readRun.js";
import type { RunArtifact } from "../src/artifacts/types.js";
import { writeRun } from "../src/artifacts/writeRun.js";

describe("run artifacts", () => {
  it("writes and resolves artifacts by latest, run id, and prompt label", async () => {
    const dir = await mkdir(path.join(os.tmpdir(), `promptdiff-artifacts-${Date.now()}-${Math.random().toString(16).slice(2)}`), { recursive: true });
    const artifact = makeArtifact("run-a", "candidate");

    await writeRun(artifact, dir);

    await expect(resolveRun("latest", dir)).resolves.toMatchObject({ artifact: { runId: "run-a" } });
    await expect(resolveRun("run-a", dir)).resolves.toMatchObject({ artifact: { prompt: { label: "candidate" } } });
    await expect(resolveRun("candidate", dir)).resolves.toMatchObject({ artifact: { runId: "run-a" } });
  });
});

function makeArtifact(runId: string, promptLabel: string): RunArtifact {
  return {
    runId,
    project: "demo",
    createdAt: "2026-07-07T12:30:00.000Z",
    provider: { type: "mock" },
    prompt: {
      label: promptLabel,
      path: "prompts/prompt.md",
      sha256: "hash"
    },
    summary: {
      total: 1,
      passed: 1,
      failed: 0
    },
    cases: [
      {
        id: "one",
        input: "hello",
        output: "hello",
        passed: true,
        assertions: [
          {
            type: "contains",
            passed: true,
            expected: "hello"
          }
        ]
      }
    ]
  };
}
