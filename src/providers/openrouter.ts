import type { Provider, PromptRunInput, PromptRunOutput } from "./Provider.js";

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
};

export function createOpenRouterProvider(model = "openrouter/auto-beta"): Provider {
  return {
    name: "openrouter",
    async run(input: PromptRunInput): Promise<PromptRunOutput> {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the OpenRouter provider");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/LegenDairy93/promptdiff",
          "X-OpenRouter-Title": "PromptDiff"
        },
        body: JSON.stringify({
          model: input.model ?? model,
          temperature: input.temperature,
          messages: [
            { role: "system", content: input.prompt },
            { role: "user", content: input.input }
          ]
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenRouter request failed with ${response.status}: ${body}`);
      }

      const raw = await response.json() as OpenRouterResponse;
      const text = raw.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("OpenRouter response did not contain message content");

      return {
        text,
        raw,
        usage: {
          inputTokens: raw.usage?.prompt_tokens,
          outputTokens: raw.usage?.completion_tokens,
          costUsd: raw.usage?.cost
        }
      };
    }
  };
}
