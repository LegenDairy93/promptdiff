# PromptDiff v0.3.0 — Behavioral Baselines and Provenance

PromptDiff started as a behavioral diff. v0.3.0 adds the first version-control primitive around that diff: an approved, named behavioral baseline with a recorded promotion decision.

## Why this release exists

A run can pass every assertion without being approved for production. Teams need to preserve the exact behavior they accepted, compare the next candidate against it, and retain the reason that baseline changed.

## New workflow

```bash
promptdiff run --target candidate
promptdiff promote latest --baseline production \
  --actor "reviewer@example.com" \
  --reason "Approved in PR #42"

promptdiff diff baseline:production latest
promptdiff baselines
promptdiff history --baseline production
```

## What is stored

- Full run snapshot for each named baseline
- SHA-256 integrity hash of the approved artifact
- Project, target, run, actor, reason, and promotion timestamp
- Previous run ID when a baseline is replaced
- Append-only local promotion history
- PromptDiff version and config provenance on new runs
- Git commit, branch, and dirty state when Git is available
- GitHub Actions run, job, ref, commit, event, and pull request metadata when available

Baseline names are restricted to portable path-safe identifiers. Reading a baseline verifies its artifact hash before it can be used in a diff or report.

## Scope and privacy

The v0.3 registry is deliberately local. `.promptdiff/` remains ignored because run inputs, outputs, prompts, and traces can contain sensitive information. Shared baselines, reviewer approvals, access control, redaction, and GitHub checks are future collaboration layers built on this local artifact contract.

## Brand direction

The project keeps the PromptDiff name. The category line expands to:

> Behavioral version control and release governance for prompts and agents.

The diff remains the entry point; baselines, promotion history, policy, replay, and incident learning form the larger product.
