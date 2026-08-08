# Captured multi-model loop

PromptDiff can review an already-recorded agent or pipeline without launching its framework. Each JSONL line is a model, tool, or final step.

The candidate changes the writer model while keeping the final text identical. PromptDiff still reports the model-path substitution.

```bash
node dist/cli.js run -c examples/multi-model-trace/promptdiff.config.yml -t baseline
node dist/cli.js promote latest --baseline production
node dist/cli.js check -c examples/multi-model-trace/promptdiff.config.yml -t candidate --baseline production -o multi-model-report.html
```

Use per-case files with `{{case.id}}`, or import a JSON envelope with `output`, `trace`, and optional `usage` paths.