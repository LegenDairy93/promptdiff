# HTTP ticket-routing workflow

This is a normal business system, not a chat demo. PromptDiff sends the same tickets to two versions of a local HTTP API and reviews a response-contract change.

The baseline only returns `category`. The candidate also returns the required `priority` and `reason`, so the diff shows the exact cases that become release-ready.

```bash
# terminal 1
node examples/http-ticket-router/server.mjs

# terminal 2, from the repository root
node dist/cli.js run -c examples/http-ticket-router/promptdiff.config.yml -t baseline
node dist/cli.js run -c examples/http-ticket-router/promptdiff.config.yml -t candidate
node dist/cli.js diff previous latest
node dist/cli.js report previous latest -o ticket-router-report.html
```

The server is deliberately deterministic so the example tests HTTP mapping rather than model quality. Replace either URL with your own staging endpoint; use `${ENV:NAME}` inside headers to read credentials from the environment without writing them into artifacts.