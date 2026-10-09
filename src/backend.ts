// Where every Jev request of this plugin goes. Command hooks read the settings from
// process.env and hooks modules from their options and `$.env`, so this file reads neither.

type JevSettings = {
  openRouterKey: string;
  typeSafeKey: string;
  openRouterModel: string;
  allowTraining: boolean;
};

export type JevBackend = {
  apiKey: string;
  baseURL: string;
  model: string;
  // Fields sent with every request besides model, state and questions.
  extra: Record<string, unknown>;
  // Respan models take state as text, so each field becomes a Markdown section.
  textState: boolean;
};

const DEFAULT_OPENROUTER_MODEL = "respan/span-01-lite";

// OpenRouter is used whenever its key is set; otherwise requests go to TypeSafe directly.
export const jevBackend = (settings: JevSettings): JevBackend => {
  if (!settings.openRouterKey)
    return {
      apiKey: settings.typeSafeKey,
      baseURL: "https://api.typesafe.ai",
      model: "jev-latest",
      extra: {},
      textState: false,
    };
  const model = settings.openRouterModel || DEFAULT_OPENROUTER_MODEL;
  return {
    apiKey: settings.openRouterKey,
    baseURL: "https://openrouter.ai/api",
    model,
    extra: { provider: { data_collection: settings.allowTraining ? "allow" : "deny" } },
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
export const systemOneRequest = (backend: JevBackend, state: unknown, questions: unknown) => ({
  url: `${backend.baseURL}/v1/systemone`,
  method: "POST" as const,
  headers: {
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

type BackendEnv = {
  OPENROUTER_API_KEY?: string | undefined;
  TYPESAFE_API_KEY?: string | undefined;
  OPENROUTER_MODEL?: string | undefined;
  CC_JEV_TEACHER_ALLOW_TRAINING?: string | undefined;
};

// The backend of a hooks module: the plugin's options first, then the environment, then the `env` of settings.json.
export const moduleBackend = (
  options: Readonly<Record<string, unknown>>,
  env: BackendEnv,
  settingsEnv: unknown,
): JevBackend => {
  const option = (key: string) => {
    const value = options[key];
    return typeof value === "string" ? value : "";
  };
  const read = (name: keyof BackendEnv) => {
    const fromSettings =
      settingsEnv && typeof settingsEnv === "object"
        ? (settingsEnv as Record<string, unknown>)[name]
        : undefined;
    return env[name] || (typeof fromSettings === "string" ? fromSettings : "");
  };
  return jevBackend({
    openRouterKey: option("openrouter_api_key") || read("OPENROUTER_API_KEY"),
    typeSafeKey: option("typesafe_api_key") || read("TYPESAFE_API_KEY"),
    openRouterModel: option("openrouter_model") || read("OPENROUTER_MODEL"),
    allowTraining: read("CC_JEV_TEACHER_ALLOW_TRAINING") === "1",
  });
};
