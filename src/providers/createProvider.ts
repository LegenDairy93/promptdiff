import type { ProviderConfig } from "../config/schema.js";
import type { Provider } from "./Provider.js";
import { createMockProvider } from "./mock.js";
import { createOpenAIProvider } from "./openai.js";
import { createOpenAICompatibleProvider } from "./openaiCompatible.js";
import { createOpenRouterProvider } from "./openrouter.js";

export function createProvider(config: ProviderConfig): Provider {
  if (config.type === "mock") return createMockProvider();
  if (config.type === "openai") return createOpenAIProvider({ model: config.model, timeoutMs: config.timeout_ms });
  if (config.type === "openrouter") return createOpenRouterProvider({ model: config.model, timeoutMs: config.timeout_ms });
  if (config.type === "openai-compatible") {
    if (!config.model) throw new Error("provider.model is required for openai-compatible");
    if (!config.base_url) throw new Error("provider.base_url is required for openai-compatible");
    if (!config.api_key_env) throw new Error("provider.api_key_env is required for openai-compatible");
    return createOpenAICompatibleProvider({
      model: config.model,
      baseUrl: config.base_url,
      apiKeyEnv: config.api_key_env,
      timeoutMs: config.timeout_ms,
      headerEnv: config.header_env
    });
  }
  throw new Error(`Unsupported provider type: ${config.type}`);
}