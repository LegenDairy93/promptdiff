import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await realpath(os.tmpdir());
const prefix = path.join(tempRoot, "promptdiff-package-");
const workspace = await mkdtemp(prefix);
const npmCommand = process.env.npm_execpath ? process.execPath : "npm";
const npmPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];

try {
  await run(npmCommand, [...npmPrefix, "run", "build"], root);
  const packed = await run(npmCommand, [...npmPrefix, "pack", "--silent", "--pack-destination", workspace], root);
  const tarballName = packed.trim().split(/\r?\n/).at(-1);
  if (!tarballName) throw new Error("npm pack did not return a tarball name");
  const tarball = path.join(workspace, tarballName);
  await access(tarball);
  await writeFile(path.join(workspace, "package.json"), JSON.stringify({ private: true }), "utf8");
  await run(npmCommand, [...npmPrefix, "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], workspace);

  const cli = path.join(workspace, "node_modules", "promptdiff", "dist", "cli.js");
  const config = path.join(workspace, "node_modules", "promptdiff", "examples", "json-classifier", "promptdiff.config.yml");
  await run(process.execPath, [cli, "--help"], workspace);
  await run(process.execPath, [cli, "run", "-c", config, "-t", "baseline"], workspace);
  await run(process.execPath, [cli, "run", "-c", config, "-t", "candidate"], workspace);
  await run(process.execPath, [cli, "diff", "previous", "latest"], workspace);
  await run(process.execPath, [cli, "report", "previous", "latest", "-o", "report.html"], workspace);

  const report = await stat(path.join(workspace, "report.html"));
  const packageJson = JSON.parse(await readFile(path.join(workspace, "node_modules", "promptdiff", "package.json"), "utf8"));
  console.log(`Package acceptance passed: ${packageJson.name}@${packageJson.version}, report ${report.size} bytes.`);
} finally {
  const resolved = await realpath(workspace);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("promptdiff-package-")) {
    throw new Error(`Refusing to clean unexpected package acceptance path: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: false });
}

async function run(command, args, cwd) {
  try {
    const result = await exec(command, args, { cwd, windowsHide: true, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    return result.stdout;
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`, { cause: error });
  }
}