import {
  ENV,
  type EntryType,
  type NoulQuestion,
  type Questions,
  type SystemOneRequest,
  TypeSafeClient,
} from "@typesafe-ai/sdk";

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { jevBackend, stateFor } from "./backend.ts";
import { count, REQUEST_LOG, REQUEST_LOG_DIR, requestLine, tally } from "./request-log.ts";

export const THRESHOLD = 0.7;

const option = (name: string) => process.env[`CLAUDE_PLUGIN_OPTION_${name}`] || "";

const backend = jevBackend({
  openRouterKey: option("OPENROUTER_API_KEY") || process.env.OPENROUTER_API_KEY || "",
  typeSafeKey: option("TYPESAFE_API_KEY") || process.env[ENV.apiKey] || "",
  openRouterModel: option("OPENROUTER_MODEL") || process.env.OPENROUTER_MODEL || "",
  allowTraining: process.env.CC_JEV_TEACHER_ALLOW_TRAINING === "1",
});

export const hasApiKey = () => backend.apiKey !== "";

const logRequest = (body: string) => {
  try {
    const sent = tally();
    count(sent, body);
    mkdirSync(REQUEST_LOG_DIR, { recursive: true });
    const ignore = `${REQUEST_LOG_DIR}/.gitignore`;
    if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
    appendFileSync(
      REQUEST_LOG,
      requestLine(basename(process.argv[1] ?? "", ".ts"), backend.model, sent),
    );
  } catch {
    return;
  }
};

// Sends one System One request to the configured backend.
export const systemOne = <const Q extends Questions>(request: SystemOneRequest<Q>) => {
  const { apiKey, baseURL, model, extra } = backend;
  const body: SystemOneRequest<Q> = {
    ...extra,
    ...request,
    state: stateFor(backend, request.state),
  };
  logRequest(JSON.stringify(body));
  return new TypeSafeClient({
    apiKey,
    baseURL,
    defaultModel: model,
    timeout: 50000,
    retry: { maxRetries: 1 },
  }).systemOne(body);
};

export type Checks = Record<string, { question: NoulQuestion; reason: string; wholeFile?: true }>;

// Asks Jev every question in one request and returns the probability of yes for each key.
export const noulsOf = async (state: EntryType, questions: Record<string, NoulQuestion>) => {
  const { answers } = await systemOne({ state, questions });
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
