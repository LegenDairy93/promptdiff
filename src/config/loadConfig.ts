import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ZodError } from "zod";
import { promptdiffConfigSchema, type LoadedConfig } from "./schema.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(configPath = "promptdiff.config.yml"): Promise<LoadedConfig> {
  const resolvedPath = path.resolve(configPath);
  if (!existsSync(resolvedPath)) {
    throw new ConfigError(`Config file not found: ${resolvedPath}`);
  }

  const text = await readFile(resolvedPath, "utf8");
  const raw = parseConfigText(text, resolvedPath);

  try {
    return {
      path: resolvedPath,
      rootDir: path.dirname(resolvedPath),
      config: promptdiffConfigSchema.parse(raw)
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues
        .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
        .join("; ");
      throw new ConfigError(`Invalid config: ${details}`);
    }
    throw error;
  }
}

function parseConfigText(text: string, filePath: string): unknown {
  const extension = path.extname(filePath).toLowerCase();
  try {
    if (extension === ".json") {
      return JSON.parse(text);
    }
    return YAML.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Could not parse config ${filePath}: ${message}`);
  }
}
