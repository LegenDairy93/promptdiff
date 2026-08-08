import { spawn } from "node:child_process";
import { z } from "zod";
import type { AgentTraceStep } from "../artifacts/types.js";
import type { TestCaseConfig, ToolDeclaration } from "../config/schema.js";

/** A trace entry the agent emitted that did not parse as a trace step. Surfaced as a violation, never fatal. */
export type MalformedStep = { index: number; message: string; raw: unknown };

export type AgentCommandOutput = {
  output: string;
  trace: AgentTraceStep[];
  /** `indices[i]` is the index of `trace[i]` in the raw array the agent emitted, so violations can cite it. */
  indices: number[];
  malformed: MalformedStep[];
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
};

const traceStepSchema = z.object({
  type: z.enum(["model", "tool", "final"]),
  name: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional()
});

const usageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  costUsd: z.number().optional()
}).optional().catch(undefined);

/** Envelope stays strict; trace steps are salvaged individually so one bad step never discards a run. */
const agentOutputSchema = z.object({
  output: z.string(),
  trace: z.array(z.unknown()).default([]),
  usage: usageSchema
});

export async function runAgentCommand(options: {
  command: string[]; cwd: string; timeoutMs: number; label: string;
  instructions?: string; tools: ToolDeclaration[]; testCase: TestCaseConfig;
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
        const envelope = agentOutputSchema.safeParse(JSON.parse(stdout));
        if (!envelope.success) throw new Error('expected JSON shaped like { "output": string, "trace": array }');
        const { steps, indices, malformed } = parseTrace(envelope.data.trace);
        finish(undefined, { output: envelope.data.output, trace: steps, indices, malformed, usage: envelope.data.usage });
      } catch (error) {
        finish(new Error(`Invalid agent command output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    child.stdin.end(JSON.stringify({
      target: {
        label: options.label,
        instructions: options.instructions,
        // `tools` kept as names for third-party agents written against v0.1; full declarations alongside.
        tools: options.tools.map((tool) => tool.name),
        tool_declarations: options.tools
      },
      case: { id: options.testCase.id, input: options.testCase.input, variables: options.testCase.variables }
    }));
  });
}

export function parseTrace(raw: unknown[]): { steps: AgentTraceStep[]; indices: number[]; malformed: MalformedStep[] } {
  const steps: AgentTraceStep[] = [];
  const indices: number[] = [];
  const malformed: MalformedStep[] = [];
  raw.forEach((value, index) => {
    const result = traceStepSchema.safeParse(value);
    if (!result.success) {
      malformed.push({ index, message: result.error.issues.map((issue) => issue.message).join("; "), raw: value });
      return;
    }
    steps.push(result.data);
    indices.push(index);
  });
  return { steps, indices, malformed };
}
