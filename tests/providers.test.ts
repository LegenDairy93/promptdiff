import { afterEach, describe, expect, it, vi } from "vitest";
import { providerConfigSchema } from "../src/config/schema.js";
import { createProvider } from "../src/providers/createProvider.js";
import { createOpenAIProvider } from "../src/providers/openai.js";
import { createOpenRouterProvider } from "../src/providers/openrouter.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bounded provider execution", () => {
  it("records the actual OpenAI response model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ model: "gpt-actual", output_text: "answer", usage: { input_tokens: 9, output_tokens: 3 } })
    }));
    const result = await createOpenAIProvider({ model: "gpt-requested", timeoutMs: 1234 }).run({ prompt: "system", input: "user" });
    expect(result).toMatchObject({ text: "answer", model: "gpt-actual", usage: { inputTokens: 9, outputTokens: 3 } });
    const [, request] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("reads text from the Responses API wire-format output array", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "gpt-actual",
        output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "wire answer" }] }]
      })
    }));
    await expect(createOpenAIProvider().run({ prompt: "system", input: "user" }))
      .resolves.toMatchObject({ text: "wire answer", model: "gpt-actual" });
  });
  it("turns an OpenRouter abort into a bounded timeout error", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-router-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(createOpenRouterProvider({ timeoutMs: 17 }).run({ prompt: "system", input: "user" }))
      .rejects.toThrow("OpenRouter request timed out after 17ms");
  });
});

describe("OpenAI-compatible provider", () => {
  it("supports a custom endpoint, environment-only secrets, extra headers, and returned model identity", async () => {
    vi.stubEnv("COMPAT_API_KEY", "compat-secret");
    vi.stubEnv("COMPAT_ORG", "org-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "provider/resolved-model",
        choices: [{ message: { content: "compatible answer" } }],
        usage: { prompt_tokens: 11, completion_tokens: 6, cost: 0.0002 }
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider(providerConfigSchema.parse({
      type: "openai-compatible",
      model: "requested-model",
      base_url: "https://inference.example/v1/",
      api_key_env: "COMPAT_API_KEY",
      header_env: { "X-Organization": "COMPAT_ORG" },
      timeout_ms: 2500
    }));
    const result = await provider.run({ prompt: "system", input: "user" });
    expect(result).toMatchObject({
      text: "compatible answer",
      model: "provider/resolved-model",
      usage: { inputTokens: 11, outputTokens: 6, costUsd: 0.0002 }
    });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://inference.example/v1/chat/completions");
    expect(request.headers).toMatchObject({ Authorization: "Bearer compat-secret", "X-Organization": "org-secret" });
  });

  it("rejects incomplete configuration before making a request", () => {
    expect(() => createProvider(providerConfigSchema.parse({ type: "openai-compatible" }))).toThrow("provider.model is required");
  });

  it("redacts configured secrets from provider error bodies", async () => {
    vi.stubEnv("COMPAT_API_KEY", "highly-secret-value");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Authorization Bearer highly-secret-value was rejected"
    }));
    const provider = createProvider(providerConfigSchema.parse({
      type: "openai-compatible",
      model: "model",
      base_url: "https://inference.example/v1",
      api_key_env: "COMPAT_API_KEY"
    }));
    const error = await provider.run({ prompt: "system", input: "user" }).catch((caught) => caught as Error);
    expect(error.message).toContain("401");
    expect(error.message).toContain("[REDACTED]");
    expect(error.message).not.toContain("highly-secret-value");
  });
});