import type { Provider, PromptRunInput, PromptRunOutput } from "./Provider.js";
import { providerError, providerFetchError } from "./http.js";

export type OpenAICompatibleOptions = {
  model: string;
  baseUrl: string;
  apiKeyEnv: string;
  timeoutMs?: number;
  headerEnv?: Record<string, string>;
};

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): Provider {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const endpoint = completionEndpoint(options.baseUrl);
  return {
    name: "openai-compatible",
    async run(input: PromptRunInput): Promise<PromptRunOutput> {
      const apiKey = process.env[options.apiKeyEnv];
      if (!apiKey) throw new Error(`${options.apiKeyEnv} is required for the OpenAI-compatible provider`);
      const extraHeaders = Object.fromEntries(Object.entries(options.headerEnv ?? {}).map(([header, envName]) => {
        const value = process.env[envName];
        if (!value) throw new Error(`${envName} is required for OpenAI-compatible header ${header}`);
        return [header, value];
      }));
      const requestedModel = input.model ?? options.model;
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...extraHeaders },
          body: JSON.stringify({
            model: requestedModel,
            temperature: input.temperature,
            messages: [
              { role: "system", content: input.prompt },
              { role: "user", content: input.input }
            ]
          }),
          signal: AbortSignal.timeout(input.timeoutMs ?? timeoutMs)
        });
      } catch (error) { throw providerFetchError("OpenAI-compatible", input.timeoutMs ?? timeoutMs, error); }
      if (!response.ok) throw await providerError("OpenAI-compatible", response, [apiKey, ...Object.values(extraHeaders)]);
      const raw = await response.json() as ChatCompletionResponse;
      const text = raw.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("OpenAI-compatible response did not contain message content");
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

function completionEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}