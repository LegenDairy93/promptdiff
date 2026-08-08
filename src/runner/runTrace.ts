import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentTraceStep } from "../artifacts/types.js";
import type { TargetConfig, TestCaseConfig } from "../config/schema.js";
import { parseTrace, type MalformedStep } from "./runAgent.js";

type TraceTarget = Extract<TargetConfig, { kind: "trace" }>;

export type ImportedTraceOutput = {
  output: string;
  trace: AgentTraceStep[];
  indices: number[];
  malformed: MalformedStep[];
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  sourceIdentity: string;
};

export async function runTraceImport(options: {
  target: TraceTarget;
  rootDir: string;
  label: string;
  testCase: TestCaseConfig;
}): Promise<ImportedTraceOutput> {
  const relativeFile = renderFile(options.target.file, options.testCase);
  const filePath = path.resolve(options.rootDir, relativeFile);
  let raw: string;
  try { raw = await readFile(filePath, "utf8"); }
  catch (error) { throw new Error(`Trace target "${options.label}" could not read ${relativeFile}: ${error instanceof Error ? error.message : String(error)}`); }

  const format = options.target.format === "auto" ? (filePath.toLowerCase().endsWith(".jsonl") ? "jsonl" : "json") : options.target.format;
  if (format === "jsonl") return fromJsonLines(raw, options.label);

  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch (error) { throw new Error(`Trace target "${options.label}" contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (Array.isArray(payload)) return fromSteps(payload, raw, options.label);

  const outputValue = readPath(payload, options.target.response.output_path);
  if (outputValue === undefined) throw new Error(`Trace target "${options.label}" is missing output path "${options.target.response.output_path}"`);
  const rawTrace = readPath(payload, options.target.response.trace_path);
  if (!Array.isArray(rawTrace)) throw new Error(`Trace target "${options.label}" trace path "${options.target.response.trace_path}" must resolve to an array`);
  const { steps, indices, malformed } = parseTrace(rawTrace);
  const usage = options.target.response.usage_path ? parseUsage(readPath(payload, options.target.response.usage_path), options.label) : undefined;
  return { output: toOutput(outputValue), trace: steps, indices, malformed, usage, sourceIdentity: raw };
}

function fromJsonLines(raw: string, label: string): ImportedTraceOutput {
  const values = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Trace target "${label}" has invalid JSONL at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  });
  return fromSteps(values, raw, label);
}

function fromSteps(values: unknown[], raw: string, label: string): ImportedTraceOutput {
  const { steps, indices, malformed } = parseTrace(values);
  const final = [...steps].reverse().find((step) => step.type === "final");
  if (!final || final.output === undefined) throw new Error(`Trace target "${label}" requires a final step with output`);
  return { output: toOutput(final.output), trace: steps, indices, malformed, sourceIdentity: raw };
}

function renderFile(template: string, testCase: TestCaseConfig): string {
  return template
    .replace(/\{\{\s*case\.id\s*\}\}/g, testCase.id)
    .replace(/\{\{\s*variables\.([A-Za-z0-9_-]+)\s*\}\}/g, (_match, name: string) => testCase.variables?.[name] ?? "");
}

function readPath(value: unknown, dotted: string): unknown {
  if (!dotted) return value;
  return dotted.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

function parseUsage(value: unknown, label: string): ImportedTraceOutput["usage"] {
  if (value === undefined) throw new Error(`Trace target "${label}" is missing the configured usage path`);
  if (!value || typeof value !== "object") throw new Error(`Trace target "${label}" usage path must resolve to an object`);
  const record = value as Record<string, unknown>;
  const usage = {
    inputTokens: optionalNumber(record.inputTokens, "inputTokens", label),
    outputTokens: optionalNumber(record.outputTokens, "outputTokens", label),
    costUsd: optionalNumber(record.costUsd, "costUsd", label)
  };
  return Object.values(usage).some((item) => item !== undefined) ? usage : undefined;
}

function optionalNumber(value: unknown, field: string, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Trace target "${label}" usage.${field} must be a non-negative number`);
  return value;
}

function toOutput(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}