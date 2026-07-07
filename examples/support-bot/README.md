# Support Bot Prompt Regression Demo

This example shows the core `promptdiff` loop: run a weaker baseline prompt, run an improved candidate prompt, then diff the local artifacts.

## Problem

A support-assistant prompt changed. The team wants to know whether the new prompt improves refund handling and JSON output behavior without sending data to a hosted evaluation service.

## Baseline Prompt

`prompts/support-v1.md` is intentionally underspecified:

```text
You are a support assistant.

Answer directly and confidently.
```

Expected behavior in the mock demo: it over-promises refunds and does not return JSON for classification.

## Candidate Prompt

`prompts/support-v2.md` adds explicit constraints:

```text
You are a support assistant.

Avoid guarantees. Use the word refund when answering refund questions.
For classification requests, return JSON with category and priority.
```

Expected behavior in the mock demo: it avoids guaranteed-refund language and returns schema-valid JSON for classification.

## Run Commands

From the repository root:

```bash
node dist/cli.js run --config examples/support-bot/promptdiff.config.yml --prompt baseline
node dist/cli.js run --config examples/support-bot/promptdiff.config.yml --prompt candidate
```

## Diff Command

```bash
node dist/cli.js diff baseline latest
```

`baseline` resolves to the latest run artifact with prompt label `baseline`; `latest` resolves to the newest run artifact overall.

## Sample Terminal Output

```text
Run ID                           Prompt    Passed  Failed  Artifact
-------------------------------  --------  ------  ------  -----------------------------------------------------
2026-07-07T16-39-55-567Z-d50bbb  baseline  0       2       .promptdiff/runs/2026-07-07T16-39-55-567Z-d50bbb.json
```

```text
Run ID                           Prompt     Passed  Failed  Artifact
-------------------------------  ---------  ------  ------  -----------------------------------------------------
2026-07-07T16-39-59-094Z-69b744  candidate  2       0       .promptdiff/runs/2026-07-07T16-39-59-094Z-69b744.json
```

```text
Left:  2026-07-07T16-39-55-567Z-d50bbb
Right: 2026-07-07T16-39-59-094Z-69b744

Metric       Left  Right  Delta
-----------  ----  -----  -----
Pass rate    0%    100%   +100%
Regressions        0

Newly passing: json-output, refund-policy
Newly failing:  none

Assertion changes
Case           Assertion       Left  Right
-------------  --------------  ----  -----
json-output    1:json_schema   fail  pass
refund-policy  2:not_contains  fail  pass
```

## Regression Gate

This command should exit `1` because it compares the passing candidate against the weaker baseline as the right-hand run:

```bash
node dist/cli.js diff latest baseline
```
