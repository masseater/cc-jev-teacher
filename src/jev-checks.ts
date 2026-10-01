import {
  ENV,
  type EntryType,
  type NoulQuestion,
  type Questions,
  type SystemOneRequest,
  TypeSafeClient,
} from "@typesafe-ai/sdk";

export const THRESHOLD = 0.7;

const option = (name: string) => process.env[`CLAUDE_PLUGIN_OPTION_${name}`] || "";

const openRouterKey = option("OPENROUTER_API_KEY") || process.env.OPENROUTER_API_KEY || "";
const typeSafeKey = option("TYPESAFE_API_KEY") || process.env[ENV.apiKey] || "";

const openRouterModel =
  option("OPENROUTER_MODEL") || process.env.OPENROUTER_MODEL || "respan/span-01-lite";

// OpenRouter is used whenever its key is set; otherwise requests go to TypeSafe directly.
const backend = openRouterKey
  ? {
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api",
      defaultModel: openRouterModel,
      extra: {
        provider: {
          data_collection: process.env.CC_JEV_TEACHER_ALLOW_TRAINING === "1" ? "allow" : "deny",
        },
      },
    }
  : { apiKey: typeSafeKey, extra: {} };

// Respan models take state as text, so each field becomes a Markdown section.
const stateFor = (state: EntryType) =>
  openRouterKey && openRouterModel.startsWith("respan/") && state && typeof state === "object"
    ? Object.entries(state)
        .map(
          ([key, value]) =>
            `## ${key}\n${typeof value === "string" ? value : JSON.stringify(value)}`,
        )
        .join("\n\n")
    : state;

export const hasApiKey = () => backend.apiKey !== "";

// Sends one System One request to the configured backend.
export const systemOne = <const Q extends Questions>(request: SystemOneRequest<Q>) => {
  const { extra, ...config } = backend;
  const body: SystemOneRequest<Q> = { ...extra, ...request, state: stateFor(request.state) };
  return new TypeSafeClient({ ...config, timeout: 50000, retry: { maxRetries: 1 } }).systemOne(
    body,
  );
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
