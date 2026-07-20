# promptdiff v0.2.0 — verifiable tool calls

*Draft. Nothing here is published; review before posting anywhere.*

## Summary

Agent tool calls used to be advisory. A target could declare `tools: [lookup_policy]`, then call
`delete_everything`, and promptdiff would record it without complaint. Worse, `diffRuns` ignored
traces entirely — so an agent that changed **which tools it called** while returning byte-identical
output produced an empty diff and a passing CI gate.

v0.2.0 makes tool calls declarable, validated, assertable, diffable, and visible.

## What's new

**Tool declarations carry contracts.**

```yaml
tools:
  - name: lookup_refund_policy
    effect: read
    args_schema:
      type: object
      required: [days_since_purchase]
      properties:
        days_since_purchase: { type: integer, minimum: 0 }
  - escalate_to_human      # bare names still work
```

**Violations.** Undeclared tool calls, arguments failing `args_schema`, malformed trace steps, and
unnamed tool steps are recorded on the run as structured `violations`. A malformed step is salvaged,
never fatal — one bad entry can't discard a whole suite.

**Five trace assertions:** `tool_called`, `tool_not_called`, `tool_args_match`,
`no_undeclared_tools`, `max_steps`. They fail loudly against a prompt target rather than passing
vacuously, because a vacuous pass on a negative assertion is a false green.

**Tool-aware diff.** `toolChanges` and `violationChanges`, severity-ranked so a `write`-effect tool
appearing sorts above a call-count change. Tool sections render above output changes and
high-severity rows are never truncated.

**Aligned traces in the HTML report**, with added/removed/changed steps highlighted, plus a
violations block per case.

## The default that matters

Tool drift is **informational**. It does not fail your build unless you ask.

| Change | Default |
|---|---|
| Declared tool A → B | Report, CI passes |
| Call count changed | Report, CI passes |
| `no_undeclared_tools` / `tool_not_called` assertion fails | **CI fails** |
| `--gate-tool-drift` | **CI fails** on added/removed tools and new violations |
| `--gate-call-deltas` | **CI fails** on count changes |

Agent execution paths vary legitimately and are often nondeterministic. Gating every difference
would create noisy CI and make prompt-to-agent comparison fail immediately — the exact workflow
promptdiff exists to support. So the default reports loudly and gates quietly, and the strict
policies are one flag or one assertion away.

## Upgrading

Nothing breaks. `tools: [name]` still parses, targets with no `tools:` are never flagged, v0.1
artifacts still read, `evaluateAssertion(a, "string")` still works, and `diffRuns(l, r)` still
compiles. The one intentional change: agent `target.sha256` shifts, because tool declarations are
now part of a target's identity — which is correct, since changing an argument schema changes the
contract. `sha256` is only displayed, never compared.

---

## Show HN draft

> **Show HN: promptdiff – prompt or agent? Run both against the same suite and diff them**
>
> Every eval tool I tried flattens a prompt and an agent into the same thing: a final string. But a
> prompt is one model call and an agent is a program that reasons, calls tools, and takes steps. The
> interesting question in review isn't "did it pass" — it's "what changed in how it got there, and
> is that safe to merge?"
>
> promptdiff runs a prompt target and an agent target against the *same* test suite and diffs them:
> pass-rate, assertions, outputs, and now the execution path — which tools were called, how often,
> with what arguments, and whether any of them were never declared.
>
> The bit I found genuinely surprising while building it: identical output tells you almost nothing.
> An agent can return the same answer while calling a more expensive tool, hitting a new external
> service, or skipping a verification step. My own diff was blind to that until this release.
>
> It's local-first — no backend, no account, plain JSON artifacts you can commit. Tool drift is
> reported but doesn't fail your build by default (execution paths vary legitimately); you lock the
> invariants you care about with assertions like `no_undeclared_tools`, or switch on `--gate-tool-drift`.
>
> Prior art: promptfoo is a much broader evaluation and red-teaming platform and is the right tool if
> that's what you need. This one deliberately does a narrower job — making a behavioral change legible
> in code review.
>
> MIT, TypeScript, `npx promptdiff init` to try it.
