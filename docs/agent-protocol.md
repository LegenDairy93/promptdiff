# Agent command protocol

An agent target is a local executable. PromptDiff starts it once per test case, writes one JSON object to standard input, and expects one JSON object on standard output. Logs belong on standard error.

## Input

```json
{
  "target": { "label": "agent-candidate", "instructions": "You are a support agent...", "tools": ["lookup_refund_policy"] },
  "case": { "id": "late-refund", "input": "Can I get a refund after 40 days?", "variables": {} }
}
```

## Output

```json
{
  "output": "The standard window is 30 days. I can help review an exception.",
  "trace": [
    { "type": "model", "output": "I need the refund policy." },
    { "type": "tool", "name": "lookup_refund_policy", "input": { "days": 40 }, "output": { "window_days": 30 } },
    { "type": "final", "output": "Explain the policy without promising a refund." }
  ]
}
```

Each step has `type: model | tool | final`, with optional `name`, `input`, and `output`. The process must exit zero and print valid JSON before `timeout_ms` (30 seconds by default).

The protocol is framework-neutral: a thin adapter can wrap an SDK, graph runtime, or application server while preserving its actual decisions and tool calls in the artifact.
