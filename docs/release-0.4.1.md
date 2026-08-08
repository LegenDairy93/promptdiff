# PromptDiff 0.4.1

This patch makes the HTML review report legible as a promotion decision without inventing operational data.

## Added

- a prominent promotion decision derived from the configured regression threshold
- measured input-token, output-token, and cost totals from run artifacts
- an optional `--projected-calls` scenario estimate
- explicit usage coverage so missing provider data is visible

## Correctness

- missing usage renders as `not recorded`, never zero
- projected cost appears only when the caller supplies a traffic assumption
- OpenRouter reports no longer claim that prompts never left the machine; the report now states only that the HTML artifact is self-contained
