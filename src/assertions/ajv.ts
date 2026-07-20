import { Ajv, type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true });
const cache = new Map<string, ValidateFunction>();

/** Compile a JSON Schema once and reuse it. Keyed on a stable stringify so YAML key reordering still hits the cache. */
export function compileSchema(schema: Record<string, unknown>): ValidateFunction {
  const key = stableStringify(schema);
  let validate = cache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    cache.set(key, validate);
  }
  return validate;
}

/**
 * Validate a value against a JSON Schema.
 * Returns `undefined` when valid, otherwise an Ajv error string.
 *
 * Ajv stores errors on the validate function and overwrites them on the next call, so
 * `errorsText` must be read immediately. Keeping that ordering here means no caller can get it wrong.
 */
export function validateAgainstSchema(schema: Record<string, unknown>, value: unknown): string | undefined {
  const validate = compileSchema(schema);
  return validate(value) ? undefined : ajv.errorsText(validate.errors);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
