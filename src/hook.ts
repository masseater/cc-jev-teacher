import { ENV, type EntryType, type NoulQuestion, TypeSafeClient } from "@typesafe-ai/sdk";

export const SCRATCH =
  /^(\/tmp\/|\/private\/|\/var\/folders\/)|\/(jobs|scratchpad|memory|projects)\//;
export const THRESHOLD = 0.7;

const apiKey = process.env.CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY || process.env[ENV.apiKey] || "";

export const hasApiKey = () => apiKey !== "";

export const clientOf = () =>
  new TypeSafeClient({ apiKey, timeout: 50000, retry: { maxRetries: 1 } });

export type Checks = Record<string, { question: NoulQuestion; reason: string }>;

// Asks Jev every check in one request and returns the reasons of the checks that fail, as list items.
export const failedOf = async (state: EntryType, checks: Checks) => {
  const { answers } = await clientOf().systemOne({
    state,
    questions: Object.fromEntries(
      Object.entries(checks).map(([key, check]) => [key, check.question]),
    ),
  });
  return Object.entries(checks)
    .filter(([key]) => (answers[key]?.noul ?? 0) >= THRESHOLD)
    .map(([, check]) => `- ${check.reason}`);
};
