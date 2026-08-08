import type { Provider, PromptRunInput, PromptRunOutput } from "./Provider.js";
import { providerError, providerFetchError } from "./http.js";

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

type OpenRouterOptions = { model?: string; timeoutMs?: number };

export function createOpenRouterProvider(input: string | OpenRouterOptions = {}): Provider {
  const options = typeof input === "string" ? { model: input } : input;
  const model = options.model ?? "openrouter/auto-beta";
  const timeoutMs = options.timeoutMs ?? 60_000;
  return {
    name: "openrouter",
    async run(runInput: PromptRunInput): Promise<PromptRunOutput> {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the OpenRouter provider");
      const requestedModel = runInput.model ?? model;
      let response: Response;
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/LegenDairy93/promptdiff",
            "X-OpenRouter-Title": "PromptDiff"
          },
          body: JSON.stringify({
            model: requestedModel,
            temperature: runInput.temperature,
            messages: [
              { role: "system", content: runInput.prompt },
              { role: "user", content: runInput.input }
            ]
          }),
          signal: AbortSignal.timeout(runInput.timeoutMs ?? timeoutMs)
        });
      } catch (error) { throw providerFetchError("OpenRouter", runInput.timeoutMs ?? timeoutMs, error); }
      if (!response.ok) throw await providerError("OpenRouter", response, [apiKey]);
      const raw = await response.json() as OpenRouterResponse;
      const text = raw.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("OpenRouter response did not contain message content");
      return {
        text,
        raw,
        model: raw.model ?? requestedModel,
        usage: {
          inputTokens: raw.usage?.prompt_tokens,
          outputTokens: raw.usage?.completion_tokens,
          costUsd: raw.usage?.cost
        }
      };
    }
  };
}