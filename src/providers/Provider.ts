export type PromptRunInput = {
  prompt: string;
  input: string;
  variables?: Record<string, string>;
  model?: string;
  temperature?: number;
};

export type PromptRunOutput = {
  text: string;
  raw?: unknown;
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
