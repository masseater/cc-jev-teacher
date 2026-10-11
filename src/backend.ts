// Where every Jev request of this plugin goes. Command hooks read the settings from
// process.env and hooks modules from their options and `$.env`, so this file reads neither.

type JevSettings = {
  openRouterKey: string;
  typeSafeKey: string;
  openRouterModel: string;
  allowTraining: boolean;
};

// Where a request is sent from, which OpenRouter records on each generation.
export type Origin = {
  place: "ci" | "cloud" | "local";
  project: string;
  hook: string;
  sessionId: string;
};

type PlaceEnv = { GITHUB_ACTIONS?: string | undefined; CLAUDE_CODE_REMOTE?: string | undefined };

export const placeOf = (env: PlaceEnv): Origin["place"] =>
  env.GITHUB_ACTIONS === "true" ? "ci" : env.CLAUDE_CODE_REMOTE === "true" ? "cloud" : "local";

const ATTRIBUTION_HEADERS = {
  "HTTP-Referer": "https://github.com/masseater/cc-jev-teacher",
  "X-OpenRouter-Title": "cc-jev-teacher",
};

export type JevBackend = {
  apiKey: string;
  baseURL: string;
  model: string;
  // Fields sent with every request besides model, state and questions.
  extra: Record<string, unknown>;
  headers: Record<string, string>;
  // Respan models take state as text, so each field becomes a Markdown section.
  textState: boolean;
};

const DEFAULT_OPENROUTER_MODEL = "respan/span-01-lite";

// OpenRouter is used whenever its key is set; otherwise requests go to TypeSafe directly.
export const jevBackend = (settings: JevSettings, origin: Origin): JevBackend => {
  if (!settings.openRouterKey)
    return {
      apiKey: settings.typeSafeKey,
      baseURL: "https://api.typesafe.ai",
      model: "jev-latest",
      extra: {},
      headers: {},
      textState: false,
    };
  const model = settings.openRouterModel || DEFAULT_OPENROUTER_MODEL;
  return {
    apiKey: settings.openRouterKey,
    baseURL: "https://openrouter.ai/api",
    model,
    extra: {
      provider: { data_collection: settings.allowTraining ? "allow" : "deny" },
      user: `${origin.place}:${origin.project}:${origin.hook}`,
      ...(origin.sessionId ? { session_id: origin.sessionId } : {}),
    },
    headers: ATTRIBUTION_HEADERS,
    textState: model.startsWith("respan/"),
  };
};

export const stateFor = <S>(backend: JevBackend, state: S): S | string =>
  backend.textState && state && typeof state === "object"
    ? Object.entries(state)
        .map(
          ([key, value]) =>
            `## ${key}\n${typeof value === "string" ? value : JSON.stringify(value)}`,
        )
        .join("\n\n")
    : state;

// The HTTP request for one System One call, for hooks modules that send it through `$.http.fetch`.
export const systemOneRequest = (
  backend: JevBackend,
  state: unknown,
  questions: unknown,
): { url: string; method: "POST"; headers: Record<string, string>; body: string } => ({
  url: `${backend.baseURL}/v1/systemone`,
  method: "POST",
  headers: {
    ...backend.headers,
    authorization: `Bearer ${backend.apiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    ...backend.extra,
    model: backend.model,
    state: stateFor(backend, state),
    questions,
  }),
});

type BackendEnv = PlaceEnv & {
  OPENROUTER_API_KEY?: string | undefined;
  TYPESAFE_API_KEY?: string | undefined;
  OPENROUTER_MODEL?: string | undefined;
  CC_JEV_TEACHER_ALLOW_TRAINING?: string | undefined;
};

// The backend of a hooks module: the plugin's options first, then the environment, as for the command hooks.
export const moduleBackend = (
  options: Readonly<Record<string, unknown>>,
  env: BackendEnv,
  origin: Omit<Origin, "place">,
): JevBackend => {
  const option = (key: string) => {
    const value = options[key];
    return typeof value === "string" ? value : "";
  };
  return jevBackend(
    {
      openRouterKey: option("openrouter_api_key") || env.OPENROUTER_API_KEY || "",
      typeSafeKey: option("typesafe_api_key") || env.TYPESAFE_API_KEY || "",
      openRouterModel: option("openrouter_model") || env.OPENROUTER_MODEL || "",
      allowTraining: env.CC_JEV_TEACHER_ALLOW_TRAINING === "1",
    },
    { ...origin, place: placeOf(env) },
  );
};
