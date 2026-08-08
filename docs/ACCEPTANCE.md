# PromptDiff product acceptance

This file is the release gate for calling PromptDiff a complete portfolio product. A passing unit suite alone is not sufficient.

## Verified baseline — 2026-08-09

- Original baseline: `npm test` passed 78 tests before product expansion.
- Current checkpoint: 92 tests pass, including HTTP workflows, trace imports, model-path diffs, bounded providers, secret redaction, and the OpenAI Responses API wire format; three distinct example paths also pass end to end.
- `npm run build`: TypeScript build passes.
- `npm pack --dry-run`: the CLI, documentation, and examples are included.
- `apps/web npm test`: build and one server-rendered HTML check pass.
- The hosted web path has not proved real model execution. Its reference sample must never be presented as a live result.

## Evidence ledger

| Gate | Status | Current evidence |
|---|---|---|
| PD-01 | Pass | `npm run test:package` builds a tarball, installs it in a new temp project, opens the installed CLI, runs two shipped targets, diffs them, and creates an HTML report. |
| PD-02 | Pass | All 78 baseline tests remain green; the additive target schemas and provider hardening bring the suite to 92 tests. |
| PD-03 | In progress | Provider adapters have mocked protocol, timeout, model-identity, usage, and secret-redaction coverage. A current real key-backed integration run is still required. |
| PD-05 | Pass | `tests/http.test.ts` proves request/body mapping, environment-backed authorization, response/trace/usage mapping, tool assertions, and bounded timeout failure. |
| PD-06 | Pass | `tests/traceImport.test.ts` proves JSON envelope and JSONL loop import, assertions, usage, per-step models, and source-content identity changes. |
| PD-07 | Pass | Model provider/identity is retained per trace step and `tests/diff.test.ts` proves a model substitution is reported when output is identical. |
| PD-08 | Pass | End-to-end runs pass for the HTTP ticket router, captured multi-model JSONL loop, and existing prompt-to-command-agent example. |
## Required gates

| ID | Requirement | Required evidence |
|---|---|---|
| PD-01 | Fresh installation works without cloning | Install the packed tarball in an empty directory, run `promptdiff --help`, and complete an offline example. |
| PD-02 | Existing configurations remain compatible | All current fixtures and examples pass unchanged, with explicit migration tests for any schema change. |
| PD-03 | Prompt targets call a real supported provider | Recorded integration run with model identity, settings, usage, latency, and redacted errors. |
| PD-04 | Command agents remain first-class | A real executable emits a validated ordered model/tool/final trace and produces a diff. |
| PD-05 | HTTP workflows are first-class | A local HTTP fixture is invoked from config; request mapping, response mapping, timeout, auth-env indirection, and failures are tested. |
| PD-06 | Imported traces are first-class | OpenTelemetry/JSONL-style trace input is normalized without executing the original system and can be diffed and reported. |
| PD-07 | Multi-model loops retain identity | Every model step records provider/model identity so router, handoff, and model-substitution changes appear in the diff. |
| PD-08 | Normal systems are demonstrated | Runnable examples cover extraction/classification or routing, an HTTP business workflow, and an agent loop—not only support chat. |
| PD-09 | Change approval is complete | Promote, named baseline, append-only history, integrity verification, and comparison against a promoted baseline pass end to end. |
| PD-10 | Review artifacts are useful | Terminal and self-contained HTML reports show output, assertions, trace/tool changes, model identity, latency, token usage, cost, and verdict basis. |
| PD-11 | CI review loop works | A documented GitHub Action runs the comparison, preserves the report, and emits a concise PR/job summary with a meaningful exit code. |
| PD-12 | Web claims are honest | With no server/key the UI is explicitly a sample and cannot run; with a configured server the selected real models execute and return fresh timestamps/results. |
| PD-13 | Hosted secrets and quota are protected | Keys stay server-side; arbitrary prompts and paid models are rejected; body, concurrency, timeout, origin, and rate limits are tested. |
| PD-14 | Documentation supports three entry points | README paths exist for “changed a prompt”, “changed an AI workflow”, and “changed an agent or multi-model loop”. |
| PD-15 | Competitive boundary is precise | README explains that Promptfoo is a broad eval/red-team matrix while PromptDiff owns before/after behavioral review, promotion history, and release gating, without false exclusivity claims. |
| PD-16 | Fresh-user acceptance passes | A clean environment follows only the README and produces a real diff and report; every ambiguity found is fixed or documented. |

## Publication rule

PromptDiff is not restored as a completed portfolio project until PD-01 through PD-16 have direct evidence. Deployment requires explicit approval and a final public smoke test.

## Non-goals for this release

- A general observability platform.
- A universal model leaderboard.
- Automatic claims that one model is globally better.
- Storing user API keys in browser code.
- Baked output presented as a live run.
