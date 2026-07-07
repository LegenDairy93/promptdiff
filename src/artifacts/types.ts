import type { AssertionResult } from "../assertions/types.js";

export type RunArtifact = {
  runId: string;
  project: string;
  createdAt: string;
  provider: {
    type: string;
    model?: string;
    temperature?: number;
  };
  prompt: {
    label: string;
    path: string;
    sha256: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  cases: Array<{
    id: string;
    input: string;
    output: string;
    passed: boolean;
    assertions: AssertionResult[];
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
    };
  }>;
};
