import { validateAgainstSchema } from "../assertions/ajv.js";
import type { AgentTraceStep, ToolViolation } from "../artifacts/types.js";
import type { ToolDeclaration } from "../config/schema.js";
import type { MalformedStep } from "./runAgent.js";

export type ValidateTraceInput = {
  steps: AgentTraceStep[];
  /** Raw-array index of each step, so violations cite what the agent actually emitted. */
  indices?: number[];
  declarations: ToolDeclaration[];
  malformed?: MalformedStep[];
};

/**
 * Check an agent's trace against its declared tools.
 *
 * Returns violations as data; nothing here flips a case to failed. The same result feeds the
 * artifact, the `no_undeclared_tools` assertion, the diff, and the report, so they can never disagree.
 */
export function validateTrace({ steps, indices, declarations, malformed = [] }: ValidateTraceInput): ToolViolation[] {
  const violations: ToolViolation[] = malformed.map((entry) => ({
    kind: "malformed_step",
    step: entry.index,
    message: `trace step ${entry.index} is not a valid trace step: ${entry.message}`
  }));

  const declared = new Map(declarations.map((tool) => [tool.name, tool]));

  steps.forEach((step, position) => {
    if (step.type !== "tool") return;
    const stepIndex = indices?.[position] ?? position;

    if (!step.name) {
      violations.push({ kind: "missing_tool_name", step: stepIndex, message: `trace step ${stepIndex} is a tool call with no name` });
      return;
    }

    // No declarations means the target opted out of tool policy — do not flood it with violations.
    if (declared.size === 0) return;

    const declaration = declared.get(step.name);
    if (!declaration) {
      violations.push({
        kind: "undeclared_tool",
        step: stepIndex,
        tool: step.name,
        message: `tool "${step.name}" was called but is not declared on this target`
      });
      return;
    }

    if (!declaration.args_schema) return;
    // Validate `{}` when the agent sent no input, so `required` fires rather than silently passing.
    const message = validateAgainstSchema(declaration.args_schema, step.input ?? {});
    if (message) {
      violations.push({
        kind: "invalid_args",
        step: stepIndex,
        tool: step.name,
        message: `tool "${step.name}" was called with invalid arguments: ${message}`
      });
    }
  });

  return violations.sort((left, right) => left.step - right.step);
}
