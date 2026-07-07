import type { Provider, PromptRunInput, PromptRunOutput } from "./Provider.js";

export function createMockProvider(): Provider {
  return {
    name: "mock",
    async run(input: PromptRunInput): Promise<PromptRunOutput> {
      const text = renderMockOutput(input);
      return {
        text,
        raw: { deterministic: true },
        usage: {
          inputTokens: estimateTokens(input.prompt) + estimateTokens(input.input),
          outputTokens: estimateTokens(text),
          costUsd: 0
        }
      };
    }
  };
}

function renderMockOutput(input: PromptRunInput): string {
  const prompt = input.prompt.toLowerCase();
  const userInput = input.input.toLowerCase();
  const wantsJson = prompt.includes("json");
  const avoidsGuarantees = prompt.includes("avoid guarantees") || prompt.includes("do not guarantee");

  if (userInput.includes("classify") || userInput.includes("charged twice")) {
    if (wantsJson) {
      return JSON.stringify({ category: "billing", priority: "medium" });
    }
    return "This looks like a billing issue with medium urgency.";
  }

  if (userInput.includes("refund")) {
    if (avoidsGuarantees) {
      return "Refund eligibility depends on the policy window. For a request after 40 days, review the order details and explain the next support step.";
    }
    return "You are guaranteed a refund after 40 days. We will process it right away.";
  }

  return `Mock response for: ${input.input}`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3));
}
