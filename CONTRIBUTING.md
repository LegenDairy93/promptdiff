# Contributing

`promptdiff` is a local-first behavioral version-control CLI for prompts and agents. Contributions should preserve portable artifacts, explicit approval decisions, deterministic behavior where possible, and CI-friendly failure modes.

## Local Setup

```bash
npm install
npm run build
npm test
```

Run the example smoke path:

```bash
node dist/cli.js run --config examples/prompt-to-agent/promptdiff.config.yml --target prompt-baseline
node dist/cli.js promote latest --baseline development --reason "Contributor smoke test"
node dist/cli.js run --config examples/prompt-to-agent/promptdiff.config.yml --target agent-candidate
node dist/cli.js diff baseline:development latest
node dist/cli.js history --baseline development
```

## Development Guidelines

- Keep provider support isolated behind the provider interface.
- Treat baseline snapshots and promotion history as compatibility-sensitive product data.
- Do not store API keys or secrets in run artifacts.
- Prefer deterministic tests and mock-provider examples.
- Add focused tests for config, assertions, artifacts, and diff behavior when changing those areas.
- Avoid hosted-backend assumptions; local-first is a product constraint, not an implementation detail.

## Reporting Issues

Include the config file shape, command used, Node/npm versions, and the relevant run artifact if it does not contain private prompt or output data.
