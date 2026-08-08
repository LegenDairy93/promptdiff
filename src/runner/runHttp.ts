import type { TargetConfig, TestCaseConfig } from "../config/schema.js";
import type { AgentTraceStep } from "../artifacts/types.js";
import { parseTrace, type MalformedStep } from "./runAgent.js";

type HttpTarget = Extract<TargetConfig, { kind: "http" }>;

export type HttpWorkflowOutput = {
  output: string;
  trace: AgentTraceStep[];
  indices: number[];
  malformed: MalformedStep[];
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
};

export async function runHttpWorkflow(options: {
  target: HttpTarget;
  label: string;
  testCase: TestCaseConfig;
}): Promise<HttpWorkflowOutput> {
  const { target, label, testCase } = options;
  const context = { input: testCase.input, caseId: testCase.id, variables: testCase.variables ?? {} };
  const url = interpolate(target.url, context);
  const headers = Object.fromEntries(Object.entries(target.headers).map(([name, value]) => [name, interpolate(value, context)]));
  const sendsBody = target.method !== "GET";
  const bodyValue = target.body === undefined
    ? { case: { id: testCase.id, input: testCase.input, variables: testCase.variables }, target: { label } }
    : renderValue(target.body, context);
  if (sendsBody && !hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method: target.method,
      headers,
      body: sendsBody ? JSON.stringify(bodyValue) : undefined,
      signal: AbortSignal.timeout(target.timeout_ms)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`HTTP target "${label}" timed out after ${target.timeout_ms}ms`);
    }
    throw new Error(`HTTP target "${label}" could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`HTTP target "${label}" returned ${response.status} ${response.statusText}`.trim());

  const rawText = await response.text();
  let payload: unknown = rawText;
  if (rawText.trim()) {
    try { payload = JSON.parse(rawText); } catch {
      if (target.response.output_path) throw new Error(`HTTP target "${label}" returned non-JSON but response.output_path is configured`);
    }
  }
  const outputValue = target.response.output_path ? readPath(payload, target.response.output_path) : payload;
  if (outputValue === undefined) throw new Error(`HTTP target "${label}" response is missing output path "${target.response.output_path}"`);
  const output = typeof outputValue === "string" ? outputValue : JSON.stringify(outputValue);

  const rawTrace = target.response.trace_path ? readPath(payload, target.response.trace_path) : [];
  if (rawTrace !== undefined && !Array.isArray(rawTrace)) throw new Error(`HTTP target "${label}" trace path must resolve to an array`);
  const { steps, indices, malformed } = parseTrace(rawTrace ?? []);
  const usage = target.response.usage_path ? parseUsage(readPath(payload, target.response.usage_path), label) : undefined;
  return { output, trace: steps, indices, malformed, usage };
}

function renderValue(value: unknown, context: TemplateContext): unknown {
  if (typeof value === "string") {
    const exact = /^\{\{\s*(input|case\.id|variables\.[A-Za-z0-9_-]+)\s*\}\}$/.exec(value);
    if (exact) return lookupTemplate(exact[1]!, context);
    return interpolate(value, context);
  }
  if (Array.isArray(value)) return value.map((item) => renderValue(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderValue(item, context)]));
  return value;
}

type TemplateContext = { input: string; caseId: string; variables: Record<string, string> };

function interpolate(value: string, context: TemplateContext): string {
  return value
    .replace(/\$\{ENV:([A-Z_][A-Z0-9_]*)\}/g, (_match, name: string) => {
      const resolved = process.env[name];
      if (resolved === undefined) throw new Error(`Required environment variable ${name} is not set`);
      return resolved;
    })
    .replace(/\{\{\s*(input|case\.id|variables\.[A-Za-z0-9_-]+)\s*\}\}/g, (_match, key: string) => String(lookupTemplate(key, context) ?? ""));
}

function lookupTemplate(key: string, context: TemplateContext): unknown {
  if (key === "input") return context.input;
  if (key === "case.id") return context.caseId;
  if (key.startsWith("variables.")) return context.variables[key.slice("variables.".length)];
  return undefined;
}

function readPath(value: unknown, dotted: string): unknown {
  if (!dotted) return value;
  return dotted.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

function parseUsage(value: unknown, label: string): HttpWorkflowOutput["usage"] {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error(`HTTP target "${label}" usage path must resolve to an object`);
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
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`HTTP target "${label}" usage.${field} must be a non-negative number`);
  return value;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((header) => header.toLowerCase() === name.toLowerCase());
}