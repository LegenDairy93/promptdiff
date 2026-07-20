# promptdiff

[![CI](https://github.com/LegenDairy93/promptdiff/actions/workflows/ci.yml/badge.svg)](https://github.com/LegenDairy93/promptdiff/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)

**Behavioral diffs for prompts and agents.**

A prompt is one model call. An agent is a program that can reason, call tools, and take several steps. Most eval output makes both look like a final string. `promptdiff` keeps the difference visible and reviews the change:

![Prompt output compared with an agent trace](docs/assets/prompt-vs-agent.svg)

```text
prompt · baseline                 →  agent · candidate
one model response                  1. model  decide to look up policy
                                    2. tool   lookup_refund_policy
                                    3. model  apply policy to the request
                                    4. final  explain the next safe action
```

The question is not only **“did the candidate pass?”** It is **“what changed in the system's behavior, tools, trace, and outcome—and is that change safe to merge?”**

## PromptDiff vs Promptfoo

[Promptfoo](https://github.com/promptfoo/promptfoo) is a broad LLM evaluation and red-teaming platform. It tests prompts, models, RAG systems, and agents across many providers, assertions, and security probes. If you need a full evaluation or red-team platform, use Promptfoo.

PromptDiff is a deliberately focused change-review tool:

| | PromptDiff | Promptfoo |
|---|---|---|
| Primary workflow | Review two behavioral snapshots | Run evaluation matrices and red-team scans |
| Main unit | A before/after change | A target × prompt × test matrix |
| Prompt representation | One-shot source, model settings, output | Prompt/provider under evaluation |
| Agent representation | Executable target, declared tools, ordered trace, final output | Custom target or provider under evaluation |
| Review artifact | Small local JSON plus a self-contained before/after HTML report | Evaluation results, dashboards, and exports |
| Intended use | Explain and gate a specific change in a PR | Measure quality, compare providers, and probe security |

This is workflow differentiation, not a claim that Promptfoo cannot test agents or detect regressions. PromptDiff chooses a narrower job: make a behavioral change legible in code review.

## See It in Two Minutes

```bash
npm install
npm run build
node dist/cli.js run -c examples/prompt-to-agent/promptdiff.config.yml -t prompt-baseline
node dist/cli.js run -c examples/prompt-to-agent/promptdiff.config.yml -t agent-candidate
node dist/cli.js diff prompt-baseline agent-candidate
node dist/cli.js report prompt-baseline agent-candidate -o promptdiff-report.html
```

The demo is deterministic and offline. The agent is a real local command target; it reads a case as JSON and returns a final output plus an ordered trace.

## Prompt and Agent Are Different Types

```yaml
targets:
  prompt-baseline:
    kind: prompt
    file: prompt.md

  agent-candidate:
    kind: agent
    command: [node, agent.mjs]
    instructions: agent.md
    tools: [lookup_refund_policy]
```

A `prompt` target runs through the configured model provider and records prompt identity, model settings, output, assertions, and usage.

An `agent` target runs your local executable and records its command, instruction identity, declared tools, ordered model/tool/final trace, output, assertions, and usage. Agent commands use a small framework-neutral JSON protocol documented in [docs/agent-protocol.md](docs/agent-protocol.md).

Legacy `prompts:` configs continue to work and are normalized to `kind: prompt`.

## What a Diff Shows

- target kind: prompt or agent
- source/instruction identity and SHA-256 hash
- model/provider or local command runtime
- declared agent tools
- pass-rate and assertion changes
- newly passing and newly failing cases
- output changes
- side-by-side agent traces in the HTML report
- a CI verdict based on allowed regressions

Artifacts are written to `.promptdiff/runs/*.json`. They stay local and are ignored by default because prompts, inputs, outputs, and traces may contain sensitive data.

## Commands

```bash
promptdiff init
promptdiff run --config promptdiff.config.yml --target candidate
promptdiff list
promptdiff show latest
promptdiff diff previous latest --max-regressions 0
promptdiff report previous latest --output promptdiff-report.html
```

`--prompt` remains as a deprecated alias for `--target`.

Exit codes:

- `0`: command succeeded and the regression threshold was not exceeded
- `1`: `diff` found more regressions than `--max-regressions` allows
- `2`: configuration or runtime error

## Assertions

The MVP supports `contains`, `not_contains`, `regex`, `json_schema`, and `max_length`. String assertions are case-insensitive by default.

## CI

```yaml
- run: npm ci
- run: npm run build
- run: npm test
- run: node dist/cli.js run -c examples/prompt-to-agent/promptdiff.config.yml -t prompt-baseline
- run: node dist/cli.js run -c examples/prompt-to-agent/promptdiff.config.yml -t agent-candidate
- run: node dist/cli.js diff prompt-baseline agent-candidate --max-regressions 0
```

## Scope

This repository is an early open-source MVP. It has no hosted service, database, authentication, semantic judge, or production observability. The mock provider and example agent are deterministic fixtures for understanding the review workflow, not substitutes for model-quality evaluation.

The roadmap follows the change-review thesis: trace-level diffs, tool-call assertions, baseline pinning, GitHub PR annotations, and adapters for common agent runtimes.

## Development

```bash
npm test
npm run build
```

Node.js 20 or newer is required. See [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE](LICENSE).
