import type { ProviderConfig } from "../config/schema.js";
import type { Provider } from "./Provider.js";
import { createMockProvider } from "./mock.js";
import { createOpenAIProvider } from "./openai.js";
import { createOpenRouterProvider } from "./openrouter.js";

export function createProvider(config: ProviderConfig): Provider {
  if (config.type === "mock") {
    return createMockProvider();
  }

  if (config.type === "openai") {
    return createOpenAIProvider(config.model);
  }

  if (config.type === "openrouter") {
    return createOpenRouterProvider(config.model);
  }

  throw new Error(`Unsupported provider type: ${config.type}`);
}
