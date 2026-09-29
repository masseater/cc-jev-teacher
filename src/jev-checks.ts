import { ENV, type EntryType, type NoulQuestion, TypeSafeClient } from "@typesafe-ai/sdk";

export const THRESHOLD = 0.7;

const apiKey = process.env.CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY || process.env[ENV.apiKey] || "";

export const hasApiKey = () => apiKey !== "";

export const clientOf = () =>
  new TypeSafeClient({ apiKey, timeout: 50000, retry: { maxRetries: 1 } });

export type Checks = Record<string, { question: NoulQuestion; reason: string; wholeFile?: true }>;

// Asks Jev every question in one request and returns the probability of yes for each key.
export const noulsOf = async (state: EntryType, questions: Record<string, NoulQuestion>) => {
  const { answers } = await clientOf().systemOne({ state, questions });
  return Object.keys(questions).map((key) => ({ key, noul: answers[key]?.noul ?? 0 }));
};

// Asks Jev every question in one request and returns the keys answered yes.
export const yesKeysOf = async (state: EntryType, questions: Record<string, NoulQuestion>) =>
  (await noulsOf(state, questions)).filter(({ noul }) => noul >= THRESHOLD).map(({ key }) => key);

// Asks Jev every check in one request and returns the reasons of the checks that fail, as list items.
export const failedOf = async (state: EntryType, checks: Checks) => {
  const failed = await yesKeysOf(
    state,
    Object.fromEntries(Object.entries(checks).map(([key, check]) => [key, check.question])),
  );
  return failed.map((key) => `- ${checks[key]?.reason}`);
};
