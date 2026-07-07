import type { Provider, PromptRunInput, PromptRunOutput } from "./Provider.js";

export function createOpenAIProvider(model = "gpt-4o-mini"): Provider {
  return {
    name: "openai",
    async run(input: PromptRunInput): Promise<PromptRunOutput> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for the OpenAI provider");
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.model ?? model,
          temperature: input.temperature,
          input: [
            {
              role: "system",
              content: input.prompt
            },
            {
              role: "user",
              content: input.input
            }
          ]
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI request failed with ${response.status}: ${body}`);
      }

      const raw = await response.json() as {
        output_text?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
        };
      };

      return {
        text: raw.output_text ?? "",
        raw,
        usage: {
          inputTokens: raw.usage?.input_tokens,
          outputTokens: raw.usage?.output_tokens
        }
      };
    }
  };
}
