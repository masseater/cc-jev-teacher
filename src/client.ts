import { TypeSafeClient } from "@typesafe-ai/sdk";

export const apiKey =
  process.env.CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY || "";

export const clientOf = () =>
  new TypeSafeClient({ apiKey, timeout: 8000, retry: { maxRetries: 2 } });
