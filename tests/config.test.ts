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
  return mkdir(path.join(os.tmpdir(), `promptdiff-${Date.now()}-${Math.random().toString(16).slice(2)}`), { recursive: true });
}
