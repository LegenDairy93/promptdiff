# Prompt-to-agent demo

`prompt-baseline` is one prompt sent to the deterministic mock provider. `agent-candidate` is a local executable that performs multiple steps and calls a declared policy tool.

```bash
node dist/cli.js run -c examples/prompt-to-agent/promptdiff.config.yml -t prompt-baseline
node dist/cli.js run -c examples/prompt-to-agent/promptdiff.config.yml -t agent-candidate
node dist/cli.js diff prompt-baseline agent-candidate
node dist/cli.js report prompt-baseline agent-candidate -o promptdiff-report.html
```

The HTML report shows target identity, tool surface, outcomes, outputs, and the agent trace together.
