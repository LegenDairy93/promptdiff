import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loadConfig.js";
import { runSuite } from "../src/runner/runSuite.js";

describe("imported trace targets", () => {
  it("imports per-case JSON envelopes and hashes the trace source", async () => {
    const dir = await makeTempDir();
    await mkdir(path.join(dir, "traces"));
    const tracePath = path.join(dir, "traces", "route.json");
    await writeFile(tracePath, JSON.stringify({
      output: { category: "billing" },
      trace: [
        { type: "model", name: "router", provider: "openrouter", model: "model/a", output: "billing" },
        { type: "tool", name: "lookup_account", input: { id: 1 }, output: "active" },
        { type: "final", output: { category: "billing" } }
      ],
      usage: { inputTokens: 20, outputTokens: 5 }
    }), "utf8");
    await writeFile(path.join(dir, "promptdiff.config.yml"), `project: imported-system
targets:
  captured:
    kind: trace
    file: traces/{{case.id}}.json
    response:
      output_path: output
      trace_path: trace
      usage_path: usage
    tools: [lookup_account]
cases:
  - id: route
    input: charged twice
    assertions:
      - type: json_schema
        schema:
          type: object
          required: [category]
      - { type: tool_called, name: lookup_account }
`, "utf8");
    const loaded = await loadConfig(path.join(dir, "promptdiff.config.yml"));
    const first = await runSuite(loaded, { artifactRoot: dir });
    expect(first.artifact.provider).toEqual({ type: "trace" });
    expect(first.artifact.target).toMatchObject({ kind: "trace", path: "traces/{{case.id}}.json" });
    expect(first.artifact.cases[0]?.output).toBe('{"category":"billing"}');
    expect(first.artifact.cases[0]?.trace?.[0]).toMatchObject({ provider: "openrouter", model: "model/a" });
    expect(first.artifact.cases[0]?.usage).toEqual({ inputTokens: 20, outputTokens: 5, costUsd: undefined });
    expect(first.artifact.cases[0]?.passed).toBe(true);

    await writeFile(tracePath, JSON.stringify({ output: { category: "billing" }, trace: [{ type: "final", output: "changed source" }], usage: {} }), "utf8");
    const second = await runSuite(loaded, { artifactRoot: dir });
    expect(second.artifact.target?.sha256).not.toBe(first.artifact.target?.sha256);
  });

  it("imports JSONL model, tool, and final steps", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "loop.jsonl"), [
      JSON.stringify({ type: "model", name: "planner", provider: "openai", model: "gpt-a", output: "plan" }),
      JSON.stringify({ type: "tool", name: "search", output: "evidence" }),
      JSON.stringify({ type: "model", name: "writer", provider: "openrouter", model: "model-b", output: "draft" }),
      JSON.stringify({ type: "final", output: "grounded answer" })
    ].join("\n"), "utf8");
    await writeFile(path.join(dir, "promptdiff.config.yml"), `project: jsonl-loop
targets:
  captured:
    kind: trace
    file: loop.jsonl
    tools: [search]
cases:
  - id: one
    input: question
    assertions:
      - { type: contains, value: grounded }
      - { type: max_steps, value: 4 }
`, "utf8");
    const { artifact } = await runSuite(await loadConfig(path.join(dir, "promptdiff.config.yml")), { artifactRoot: dir });
    expect(artifact.cases[0]?.output).toBe("grounded answer");
    expect(artifact.cases[0]?.trace?.filter((step) => step.type === "model").map((step) => step.model)).toEqual(["gpt-a", "model-b"]);
    expect(artifact.cases[0]?.passed).toBe(true);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `promptdiff-trace-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}