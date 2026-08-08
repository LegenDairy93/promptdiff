import { createServer, type Server } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loadConfig.js";
import { runHttpWorkflow } from "../src/runner/runHttp.js";
import { runSuite } from "../src/runner/runSuite.js";

let server: Server;
let baseUrl = "";
const requests: Array<{ authorization?: string; body: unknown }> = [];

beforeAll(async () => {
  server = createServer(async (request, response) => {
    if (request.url === "/slow") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      response.writeHead(200, { "Content-Type": "application/json" }).end('{"output":"late"}');
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    requests.push({ authorization: request.headers.authorization, body: JSON.parse(raw) });
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      result: { text: "classified hello" },
      execution: { trace: [
        { type: "model", name: "router", provider: "openrouter", model: "model/a", output: "route" },
        { type: "tool", name: "lookup", input: { id: 7 }, output: "found" },
        { type: "final", output: "classified hello" }
      ] },
      meta: { usage: { inputTokens: 12, outputTokens: 4, costUsd: 0.001 } }
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an HTTP test port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("HTTP workflow targets", () => {
  it("maps requests and records output, trace model identity, tools, and usage", async () => {
    const dir = await makeTempDir();
    const previous = process.env.PD_HTTP_TOKEN;
    process.env.PD_HTTP_TOKEN = "test-secret";
    try {
      await writeFile(path.join(dir, "promptdiff.config.yml"), `project: http-demo
targets:
  workflow:
    kind: http
    url: ${baseUrl}/run
    headers:
      Authorization: "Bearer \${ENV:PD_HTTP_TOKEN}"
    body:
      message: "{{input}}"
      tier: "{{variables.tier}}"
    response:
      output_path: result.text
      trace_path: execution.trace
      usage_path: meta.usage
    tools:
      - name: lookup
        effect: read
cases:
  - id: classify
    input: hello
    variables: { tier: pro }
    assertions:
      - { type: contains, value: classified }
      - { type: tool_called, name: lookup }
`, "utf8");
      const loaded = await loadConfig(path.join(dir, "promptdiff.config.yml"));
      expect(loaded.config.targets?.workflow).toMatchObject({ kind: "http", method: "POST", timeout_ms: 30000 });
      const { artifact } = await runSuite(loaded, { artifactRoot: dir });
      expect(requests.at(-1)).toEqual({ authorization: "Bearer test-secret", body: { message: "hello", tier: "pro" } });
      expect(artifact.provider).toEqual({ type: "http" });
      expect(artifact.target).toMatchObject({ kind: "http", tools: ["lookup"] });
      expect(artifact.cases[0]?.output).toBe("classified hello");
      expect(artifact.cases[0]?.usage).toEqual({ inputTokens: 12, outputTokens: 4, costUsd: 0.001 });
      expect(artifact.cases[0]?.trace?.[0]).toMatchObject({ type: "model", provider: "openrouter", model: "model/a" });
      expect(artifact.cases[0]?.passed).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.PD_HTTP_TOKEN; else process.env.PD_HTTP_TOKEN = previous;
    }
  });

  it("fails with a bounded timeout", async () => {
    await expect(runHttpWorkflow({
      label: "slow-workflow",
      target: { kind: "http", url: `${baseUrl}/slow`, method: "GET", headers: {}, response: { output_path: "output" }, tools: [], timeout_ms: 20 },
      testCase: { id: "slow", input: "hello", assertions: [{ type: "contains", value: "late" }] }
    })).rejects.toThrow(/timed out after 20ms/);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `promptdiff-http-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}