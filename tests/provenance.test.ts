import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectProvenance } from "../src/artifacts/provenance.js";

describe("run provenance", () => {
  it("records the PromptDiff version and a portable config path outside git", async () => {
    const root = path.join(os.tmpdir(), `promptdiff-provenance-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(path.join(root, "config"), { recursive: true });

    const provenance = await collectProvenance({
      cwd: root,
      artifactRoot: root,
      configPath: path.join(root, "config", "promptdiff.config.yml")
    });

    expect(provenance.promptdiffVersion).toBe("0.4.1");
    expect(provenance.configPath).toBe("config/promptdiff.config.yml");
    expect(provenance.git).toBeUndefined();
  });
});
