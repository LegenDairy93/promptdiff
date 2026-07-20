import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAgentCommand } from "../src/runner/runAgent.js";
import { runSuite } from "../src/runner/runSuite.js";
import { loadConfig } from "../src/config/loadConfig.js";
import type { TestCaseConfig } from "../src/config/schema.js";

const exampleDir = path.resolve(fileURLToPath(new URL("../examples/prompt-to-agent", import.meta.url)));

const testCase: TestCaseConfig = {
  id: "late-refund",
  input: "Can I get a refund after 40 days?",
  assertions: [{ type: "contains", value: "refund" }]
};

/** Run an inline node script as the agent, so failure paths need no fixture files. */
function inlineAgent(script: string) {
  return { command: [process.execPath, "-e", script], cwd: os.tmpdir(), timeoutMs: 5_000, label: "inline", tools: [], testCase };
}

describe("runAgentCommand", () => {
  it("runs a real agent executable and captures its trace", async () => {
    const result = await runAgentCommand({
      command: [process.execPath, "agent.mjs"], cwd: exampleDir, timeoutMs: 10_000,
      label: "agent-candidate", tools: [{ name: "lookup_refund_policy" }], testCase
    });

    expect(result.output.toLowerCase()).toContain("refund");
    expect(result.malformed).toEqual([]);
    expect(result.trace.some((step) => step.type === "tool" && step.name === "lookup_refund_policy")).toBe(true);
  });

  it("salvages malformed trace entries instead of discarding the run", async () => {
    const result = await runAgentCommand(inlineAgent(
      `process.stdout.write(JSON.stringify({ output: "fine", trace: [1, 2, 3] }))`
    ));

    expect(result.output).toBe("fine");
    expect(result.trace).toEqual([]);
    expect(result.malformed).toHaveLength(3);
    expect(result.malformed.map((entry) => entry.index)).toEqual([0, 1, 2]);
  });

  it("keeps valid steps and their raw indices when only some entries are malformed", async () => {
    const result = await runAgentCommand(inlineAgent(
      `process.stdout.write(JSON.stringify({ output: "ok", trace: [1, { type: "tool", name: "search" }] }))`
    ));

    expect(result.trace).toEqual([{ type: "tool", name: "search" }]);
    expect(result.indices).toEqual([1]);
    expect(result.malformed.map((entry) => entry.index)).toEqual([0]);
  });

  it("degrades a malformed usage block rather than failing", async () => {
    const result = await runAgentCommand(inlineAgent(
      `process.stdout.write(JSON.stringify({ output: "ok", trace: [], usage: "nonsense" }))`
    ));

    expect(result.usage).toBeUndefined();
    expect(result.output).toBe("ok");
  });

  it("rejects a non-zero exit and surfaces stderr", async () => {
    await expect(runAgentCommand(inlineAgent(
      `process.stderr.write("boom"); process.exit(3)`
    ))).rejects.toThrow(/exited 3.*boom/s);
  });

  it("rejects non-JSON stdout", async () => {
    await expect(runAgentCommand(inlineAgent(`process.stdout.write("not json")`)))
      .rejects.toThrow(/Invalid agent command output/);
  });

  it("rejects output that is missing the required string field", async () => {
    await expect(runAgentCommand(inlineAgent(`process.stdout.write(JSON.stringify({ trace: [] }))`)))
      .rejects.toThrow(/Invalid agent command output/);
  });

  it("kills and rejects an agent that outruns its timeout", async () => {
    await expect(runAgentCommand({
      ...inlineAgent(`setTimeout(() => {}, 10000)`), timeoutMs: 60
    })).rejects.toThrow(/timed out after 60ms/);
  });
});

describe("runSuite with an agent target", () => {
  it("records trace, violations, and tool declarations in the artifact", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "agent.mjs"), `let input = "";
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(JSON.stringify({ output: "done", trace: [
  { type: "tool", name: "allowed", input: { n: 1 } },
  { type: "tool", name: "sneaky" }
] }));
`, "utf8");
    await writeFile(path.join(dir, "promptdiff.config.yml"), `project: demo
targets:
  workflow:
    kind: agent
    command: [node, agent.mjs]
    tools:
      - name: allowed
        effect: read
cases:
  - id: one
    input: hello
    assertions:
      - { type: contains, value: done }
      - { type: no_undeclared_tools }
`, "utf8");

    const { artifact } = await runSuite(await loadConfig(path.join(dir, "promptdiff.config.yml")), { artifactRoot: dir });
    const [only] = artifact.cases;

    expect(artifact.target?.tools).toEqual(["allowed"]);
    expect(artifact.target?.toolDecls).toEqual([{ name: "allowed", effect: "read" }]);
    expect(only?.trace).toHaveLength(2);
    expect(only?.violations).toEqual([expect.objectContaining({ kind: "undeclared_tool", tool: "sneaky" })]);
    // The violation drives the assertion, so report and gate can never disagree.
    expect(only?.assertions[1]).toMatchObject({ type: "no_undeclared_tools", passed: false });
    expect(only?.passed).toBe(false);
  });

  it("omits violations entirely on a clean run so artifacts stay v0.1-shaped", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "agent.mjs"), `let input = "";
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(JSON.stringify({ output: "done", trace: [{ type: "tool", name: "allowed" }] }));
`, "utf8");
    await writeFile(path.join(dir, "promptdiff.config.yml"), `project: demo
targets:
  workflow:
    kind: agent
    command: [node, agent.mjs]
    tools: [allowed]
cases:
  - id: one
    input: hello
    assertions:
      - { type: contains, value: done }
`, "utf8");

    const result = await runSuite(await loadConfig(path.join(dir, "promptdiff.config.yml")), { artifactRoot: dir });

    expect(result.artifact.cases[0]?.violations).toBeUndefined();
    // The contract is the serialized artifact: a clean run must stay byte-shaped like v0.1.
    const written = await readFile(result.path, "utf8");
    expect(written).not.toContain("violations");
    expect(JSON.parse(written).cases[0]).not.toHaveProperty("violations");
  });
});

/**
 * Do NOT return mkdir's result: on Windows a recursive mkdir yields an extended-length path
 * (`\\?\C:\...`), and passing that as a subprocess cwd breaks Node's module resolution.
 */
async function makeTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `promptdiff-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
