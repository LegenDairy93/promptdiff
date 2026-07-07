# Contributing

`promptdiff` is an early local-first CLI for prompt regression testing. Contributions should keep the MVP focused: deterministic local runs, readable artifacts, clear assertions, and CI-friendly behavior.

## Local Setup

```bash
npm install
npm run build
npm test
```

Run the example smoke path:

```bash
node dist/cli.js run --config examples/support-bot/promptdiff.config.yml --prompt baseline
node dist/cli.js run --config examples/support-bot/promptdiff.config.yml --prompt candidate
node dist/cli.js diff baseline latest
```

## Development Guidelines

- Keep provider support isolated behind the provider interface.
- Do not store API keys or secrets in run artifacts.
- Prefer deterministic tests and mock-provider examples.
- Add focused tests for config, assertions, artifacts, and diff behavior when changing those areas.
- Avoid hosted-backend assumptions; local-first is a product constraint, not an implementation detail.

## Reporting Issues

Include the config file shape, command used, Node/npm versions, and the relevant run artifact if it does not contain private prompt or output data.
