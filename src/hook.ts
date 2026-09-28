import { homedir } from "node:os";
import { join } from "node:path";

import { ENV, type EntryType, type NoulQuestion, TypeSafeClient } from "@typesafe-ai/sdk";

export const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const TEMPORARY = /^(\/tmp\/|\/private\/|\/var\/folders\/)/;
export const THRESHOLD = 0.7;

// Temporary files, and the session state Claude Code keeps under its config directory (transcripts, memory, jobs).
export const isScratch = (path: string) =>
  TEMPORARY.test(path) ||
  ["projects", "jobs"].some((dir) => path.startsWith(`${join(CONFIG_DIR, dir)}/`));

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
