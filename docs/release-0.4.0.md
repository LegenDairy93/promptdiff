# PromptDiff 0.4.0

PromptDiff 0.4.0 adds live OpenRouter comparisons without changing the local artifact and approval workflow.

## Added

- an `openrouter` provider backed by the Chat Completions API
- target-specific provider, model, and temperature settings for prompt targets
- normalized OpenRouter token and cost data in run artifacts
- a runnable two-prompt OpenRouter example
- a local `.env.example` key setup that keeps secrets out of Git

## Why target-specific providers matter

A global provider would make an OpenRouter integration cosmetic: both sides of a comparison would still share one model configuration. Target-level overrides make these useful change reviews possible:

- prompt A vs prompt B on the same model
- model A vs model B on the same prompt
- a simultaneous prompt-and-model migration

The test cases and assertions remain shared, so the changed runtime configuration stays visible rather than becoming a hidden test variable.
