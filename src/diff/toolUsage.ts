import type { RunArtifact } from "../artifacts/types.js";

export type ToolUsage = Map<string, number>;

/** Count `type: "tool"` steps by name. Cases with no trace (prompt targets, v0.1 artifacts) yield an empty map. */
export function toolUsage(testCase?: RunArtifact["cases"][number]): ToolUsage {
  const usage: ToolUsage = new Map();
  for (const step of testCase?.trace ?? []) {
    if (step.type !== "tool" || !step.name) continue;
    usage.set(step.name, (usage.get(step.name) ?? 0) + 1);
  }
  return usage;
}
