import {
  type EntryType,
  type NoulQuestion,
  type Questions,
  type SystemOneRequest,
  TypeSafeClient,
} from "@typesafe-ai/sdk";

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { processBackend, stateFor } from "./backend.ts";
import {
  count,
  REQUEST_LOG,
  REQUEST_LOG_DIR,
  REQUEST_LOG_IGNORE,
  requestLine,
  tally,
} from "./request-log.ts";

export const THRESHOLD = 0.7;

const hook = basename(process.argv[1] ?? "", ".ts");

const project = basename(process.env.CLAUDE_PROJECT_DIR || process.cwd());

const backendFor = (sessionId: string) => processBackend(process.env, { project, hook, sessionId });

export const hasApiKey = () => backendFor("").apiKey !== "";

const logRequest = (model: string, body: string) => {
  try {
    const sent = tally();
    count(sent, body);
    mkdirSync(REQUEST_LOG_DIR, { recursive: true });
    if (!existsSync(REQUEST_LOG_IGNORE)) writeFileSync(REQUEST_LOG_IGNORE, "*\n");
    appendFileSync(REQUEST_LOG, requestLine(hook, model, sent));
  } catch {
    return;
  }
};

export type Checks = Record<string, { question: NoulQuestion; reason: string; wholeFile?: true }>;

// The System One calls of one hook run, sent on behalf of the session in its input.
export const jevFor = (input: { session_id: string }) => {
  const backend = backendFor(input.session_id);

  // Sends one System One request to the configured backend.
  const systemOne = <const Q extends Questions>(request: SystemOneRequest<Q>) => {
    const { apiKey, baseURL, model, extra, headers } = backend;
    const body: SystemOneRequest<Q> = {
      ...extra,
      ...request,
      state: stateFor(backend, request.state),
    };
    logRequest(model, JSON.stringify(body));
    return new TypeSafeClient({
      apiKey,
      baseURL,
      defaultModel: model,
      defaultHeaders: headers,
      timeout: 50000,
      retry: { maxRetries: 1 },
    }).systemOne(body);
  };

  // Asks Jev every question in one request and returns the probability of yes for each key.
  const noulsOf = async (state: EntryType, questions: Record<string, NoulQuestion>) => {
    const { answers } = await systemOne({ state, questions });
    return Object.keys(questions).map((key) => ({ key, noul: answers[key]?.noul ?? 0 }));
  };

  // Asks Jev every question in one request and returns the keys answered yes.
  const yesKeysOf = async (state: EntryType, questions: Record<string, NoulQuestion>) =>
    (await noulsOf(state, questions)).filter(({ noul }) => noul >= THRESHOLD).map(({ key }) => key);

  // Asks Jev every check in one request and returns the reasons of the checks that fail, as list items.
  const failedOf = async (state: EntryType, checks: Checks) => {
    const failed = await yesKeysOf(
      state,
      Object.fromEntries(Object.entries(checks).map(([key, check]) => [key, check.question])),
    );
    return failed.map((key) => `- ${checks[key]?.reason}`);
  };

  return { systemOne, noulsOf, yesKeysOf, failedOf };
};

export type Jev = ReturnType<typeof jevFor>;
