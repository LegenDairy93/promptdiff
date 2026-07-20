import { spawn } from "node:child_process";
import type { AgentTraceStep } from "../artifacts/types.js";
import type { TestCaseConfig } from "../config/schema.js";

export type AgentCommandOutput = {
  output: string;
  trace: AgentTraceStep[];
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
};

export async function runAgentCommand(options: {
  command: string[]; cwd: string; timeoutMs: number; label: string;
  instructions?: string; tools: string[]; testCase: TestCaseConfig;
}): Promise<AgentCommandOutput> {
  const [executable, ...args] = options.command;
  if (!executable) throw new Error("Agent command cannot be empty");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error, value?: AgentCommandOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`Agent target "${options.label}" timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);
    child.on("error", (error) => finish(new Error(`Could not start agent command: ${error.message}`)));
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (code !== 0) return finish(new Error(`Agent command exited ${code}: ${stderr.trim() || "no stderr"}`));
      try {
        const parsed = JSON.parse(stdout) as Partial<AgentCommandOutput>;
        if (typeof parsed.output !== "string" || !Array.isArray(parsed.trace)) throw new Error('expected JSON shaped like { "output": string, "trace": array }');
        finish(undefined, parsed as AgentCommandOutput);
      } catch (error) {
        finish(new Error(`Invalid agent command output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    child.stdin.end(JSON.stringify({
      target: { label: options.label, instructions: options.instructions, tools: options.tools },
      case: { id: options.testCase.id, input: options.testCase.input, variables: options.testCase.variables }
    }));
  });
}
