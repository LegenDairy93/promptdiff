export async function providerError(label: string, response: Response, secrets: string[] = []): Promise<Error> {
  let detail = "";
  try { detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 500); } catch { /* status is still useful */ }
  detail = redact(detail, secrets);
  return new Error(`${label} request failed with ${response.status}${detail ? `: ${detail}` : ""}`);
}

export function providerFetchError(label: string, timeoutMs: number, error: unknown): Error {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new Error(`${label} request timed out after ${timeoutMs}ms`);
  }
  return new Error(`${label} request could not be completed: ${error instanceof Error ? error.message : String(error)}`);
}

export function redact(value: string, secrets: string[] = []): string {
  let output = value
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/sk-(?:or-)?[A-Za-z0-9_-]{8,}/g, "[REDACTED]");
  for (const secret of secrets.filter(Boolean)) output = output.split(secret).join("[REDACTED]");
  return output;
}