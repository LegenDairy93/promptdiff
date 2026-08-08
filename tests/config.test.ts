import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loadConfig.js";

describe("loadConfig", () => {
  it("loads and validates YAML config", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "promptdiff.config.yml");
    await writeFile(configPath, `project: demo
prompts:
  candidate: prompts/prompt.md
provider:
  type: mock
cases:
  - id: one
    input: hello
    assertions:
      - type: contains
        value: hello
`, "utf8");

    const loaded = await loadConfig(configPath);

    expect(loaded.config.project).toBe("demo");
    expect(loaded.config.provider.type).toBe("mock");
    expect(loaded.config.cases).toHaveLength(1);
  });

  it("loads explicit prompt and agent targets as different kinds", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "promptdiff.config.yml");
    await writeFile(configPath, `project: demo
targets:
  simple:
    kind: prompt
    file: prompt.md
  workflow:
    kind: agent
    command: [node, agent.mjs]
    tools: [search]
cases:
  - id: one
    input: hello
    assertions:
      - type: contains
        value: hello
`, "utf8");

    const loaded = await loadConfig(configPath);

    expect(loaded.config.targets?.simple.kind).toBe("prompt");
    // Bare tool names normalize to declarations, so downstream code never sees a union.
    expect(loaded.config.targets?.workflow).toMatchObject({ kind: "agent", tools: [{ name: "search" }] });
  });

  it("accepts a mix of bare tool names and full declarations", async () => {
    const loaded = await loadConfig(await writeConfig(`project: demo
targets:
  workflow:
    kind: agent
    command: [node, agent.mjs]
    tools:
      - search
      - name: refund_policy
        effect: read
        args_schema:
          type: object
          required: [days]
          properties:
            days: { type: integer }
cases:
  - id: one
    input: hello
    assertions:
      - type: contains
        value: hello
`));

    expect(loaded.config.targets?.workflow).toMatchObject({
      tools: [{ name: "search" }, { name: "refund_policy", effect: "read" }]
    });
  });

  it("accepts target-specific provider settings", async () => {
    const loaded = await loadConfig(await writeConfig(`project: demo
targets:
  baseline:
    kind: prompt
    file: prompt-v1.md
    provider:
      type: openrouter
      model: model/a
      temperature: 0
  candidate:
    kind: prompt
    file: prompt-v2.md
    provider:
      type: openrouter
      model: model/b
cases:
  - id: one
    input: hello
    assertions:
      - type: contains
        value: hello
`));

    expect(loaded.config.targets?.baseline).toMatchObject({
      kind: "prompt",
      provider: { type: "openrouter", model: "model/a", temperature: 0 }
    });
    expect(loaded.config.targets?.candidate).toMatchObject({
      kind: "prompt",
      provider: { type: "openrouter", model: "model/b" }
    });
  });

  it("rejects duplicate tool names", async () => {
    await expect(loadConfig(await writeConfig(`project: demo
targets:
  workflow:
    kind: agent
    command: [node, agent.mjs]
    tools: [search, search]
cases:
  - id: one
    input: hello
    assertions:
      - type: contains
        value: hello
`))).rejects.toThrow("duplicate tool names");
  });

  it("rejects tool_args_match without args or schema", async () => {
    await expect(loadConfig(await writeConfig(`project: demo
targets:
  workflow:
    kind: agent
    command: [node, agent.mjs]
    tools: [search]
cases:
  - id: one
    input: hello
    assertions:
      - type: tool_args_match
        name: search
`))).rejects.toThrow("tool_args_match requires args or schema");
  });

  it("rejects configs without cases", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "promptdiff.config.yml");
    await writeFile(configPath, `project: demo
prompts:
  candidate: prompts/prompt.md
cases: []
`, "utf8");

    await expect(loadConfig(configPath)).rejects.toThrow("Invalid config");
  });
});

async function makeTempDir(): Promise<string> {
  // Returning mkdir's result yields a `\\?\C:\...` extended-length path on Windows; build it ourselves.
  const dir = path.join(os.tmpdir(), `promptdiff-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeConfig(contents: string): Promise<string> {
  const configPath = path.join(await makeTempDir(), "promptdiff.config.yml");
  await writeFile(configPath, contents, "utf8");
  return configPath;
}
