import type { Provider, PromptRunInput, PromptRunOutput } from "./Provider.js";
import { providerError, providerFetchError } from "./http.js";

type OpenAIResponse = {
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type OpenAIOptions = { model?: string; timeoutMs?: number };

export function createOpenAIProvider(input: string | OpenAIOptions = {}): Provider {
  const options = typeof input === "string" ? { model: input } : input;
  const model = options.model ?? "gpt-4o-mini";
  const timeoutMs = options.timeoutMs ?? 60_000;
  return {
    name: "openai",
    async run(runInput: PromptRunInput): Promise<PromptRunOutput> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI provider");
      const requestedModel = runInput.model ?? model;
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: requestedModel,
            temperature: runInput.temperature,
            input: [
              { role: "system", content: runInput.prompt },
              { role: "user", content: runInput.input }
            ]
          }),
          signal: AbortSignal.timeout(runInput.timeoutMs ?? timeoutMs)
        });
      } catch (error) { throw providerFetchError("OpenAI", runInput.timeoutMs ?? timeoutMs, error); }
      if (!response.ok) throw await providerError("OpenAI", response, [apiKey]);
      const raw = await response.json() as OpenAIResponse;
      const text = responseText(raw);
      if (!text) throw new Error("OpenAI response did not contain text output");
      return {
        text,
        raw,
        model: raw.model ?? requestedModel,
        usage: { inputTokens: raw.usage?.input_tokens, outputTokens: raw.usage?.output_tokens }
      };
    }
  };
}

function responseText(response: OpenAIResponse): string {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.type === "message" ? item.content ?? [] : [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}
