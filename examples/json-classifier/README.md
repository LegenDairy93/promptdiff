# JSON Classifier Schema Regression Demo

This example focuses on `json_schema`, the assertion that makes `promptdiff` useful beyond simple string checks.

## Problem

A classifier prompt is supposed to return machine-readable JSON. The baseline prompt gives a human-readable sentence, which is easy to read but unsafe for downstream automation. The candidate prompt requires a stable object shape.

## Run

```bash
node dist/cli.js run --config examples/json-classifier/promptdiff.config.yml --prompt baseline
node dist/cli.js run --config examples/json-classifier/promptdiff.config.yml --prompt candidate
node dist/cli.js diff baseline latest
```

## Expected Result

The baseline fails the JSON Schema assertion. The candidate passes with output shaped like:

```json
{"category":"billing","priority":"medium"}
```

This demonstrates the regression-testing value: a prompt can sound reasonable while still breaking a typed integration contract.
