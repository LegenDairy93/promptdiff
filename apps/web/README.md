# PromptDiff web

Recruiter-facing live product surface for PromptDiff. It runs fixed comparison packs through currently available zero-cost OpenRouter models, evaluates both sides with explicit checks, and returns a promotion decision with evidence, token usage, latency, and measured cost.

The browser never receives provider credentials. `OPENROUTER_API_KEY` is a server-side secret. Public requests cannot submit arbitrary prompts or select paid models.

```bash
npm install
npm run dev
npm test
```