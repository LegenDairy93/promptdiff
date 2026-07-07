import type { TestCaseConfig } from "../config/schema.js";

export function renderPrompt(prompt: string, testCase: TestCaseConfig): string {
  const variables: Record<string, string> = {
    input: testCase.input,
    ...(testCase.variables ?? {})
  };

  return prompt.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}
