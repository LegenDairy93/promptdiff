export type PromptRunInput = {
  prompt: string;
  input: string;
  variables?: Record<string, string>;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
};

export type PromptRunOutput = {
  text: string;
  raw?: unknown;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
};

export interface Provider {
  name: string;
  run(input: PromptRunInput): Promise<PromptRunOutput>;
}
