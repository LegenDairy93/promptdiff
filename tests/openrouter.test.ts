import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider } from "../src/providers/openrouter.js";

describe("OpenRouter provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a chat completion and records normalized usage", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "example/model",
        choices: [{ message: { content: "candidate answer" } }],
        usage: { prompt_tokens: 14, completion_tokens: 7, cost: 0.00012 }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOpenRouterProvider("example/model").run({
      prompt: "Follow the policy.",
      input: "Can I return this?",
      temperature: 0
    });

    expect(result.text).toBe("candidate answer");
    expect(result.usage).toEqual({ inputTokens: 14, outputTokens: 7, costUsd: 0.00012 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "example/model",
      temperature: 0,
      messages: [
        { role: "system", content: "Follow the policy." },
        { role: "user", content: "Can I return this?" }
      ]
    });
  });

  it("fails clearly when the API key is absent", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(createOpenRouterProvider().run({ prompt: "test", input: "test" }))
      .rejects.toThrow("OPENROUTER_API_KEY is required");
  });

  it("surfaces API errors without hiding the response body", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited"
    }));

    await expect(createOpenRouterProvider().run({ prompt: "test", input: "test" }))
      .rejects.toThrow("OpenRouter request failed with 429: rate limited");
  });
});
