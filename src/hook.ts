import { ENV, TypeSafeClient } from "@typesafe-ai/sdk";

export const SCRATCH = /^(\/tmp\/|\/private\/|\/var\/folders\/)|\/(jobs|scratchpad|memory|projects)\//;
export const THRESHOLD = 0.7;

const apiKey =
  process.env.CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY || process.env[ENV.apiKey] || "";

export const hasApiKey = () => apiKey !== "";

export const clientOf = () =>
  new TypeSafeClient({ apiKey, timeout: 8000, retry: { maxRetries: 2 } });
