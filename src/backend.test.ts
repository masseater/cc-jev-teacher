import { describe, expect, it } from "vite-plus/test";

import { jevBackend, moduleBackend, placeOf, stateFor, systemOneRequest } from "./backend.ts";

const settings = { openRouterKey: "", openRouterModel: "", allowTraining: false };
const origin = { place: "cloud", project: "app", hook: "script-edit", sessionId: "s1" } as const;

describe("jevBackend", () => {
  it("sends to OpenRouter, defaulting to Respan Span-01 Lite with data collection denied", () => {
    expect(jevBackend({ ...settings, openRouterKey: "or" }, origin)).toEqual({
      apiKey: "or",
      baseURL: "https://openrouter.ai/api",
      model: "respan/span-01-lite",
      extra: {
        provider: { data_collection: "deny" },
        user: "cloud:app:script-edit",
        session_id: "s1",
      },
      headers: {
        "HTTP-Referer": "https://github.com/masseater/cc-jev-teacher",
        "X-OpenRouter-Title": "cc-jev-teacher",
      },
      textState: true,
    });
  });

  it("sends structured state to non-Respan models and allows training only when asked", () => {
    const backend = jevBackend(
      {
        ...settings,
        openRouterKey: "or",
        openRouterModel: "typesafe/jev-1.13",
        allowTraining: true,
      },
      { ...origin, sessionId: "" },
    );
    expect(backend.textState).toBe(false);
    expect(backend.extra).toEqual({
      provider: { data_collection: "allow" },
      user: "cloud:app:script-edit",
    });
  });
});

describe("placeOf", () => {
  it("tells GitHub Actions, Claude Code on the web and a local machine apart", () => {
    expect(placeOf({ GITHUB_ACTIONS: "true", CLAUDE_CODE_REMOTE: "true" })).toBe("ci");
    expect(placeOf({ CLAUDE_CODE_REMOTE: "true" })).toBe("cloud");
    expect(placeOf({})).toBe("local");
  });
});

describe("systemOneRequest", () => {
  it("posts state as Markdown sections to Respan models, with the request's origin", () => {
    const backend = jevBackend({ ...settings, openRouterKey: "or" }, origin);
    const request = systemOneRequest(backend, { goal: "ship", history: [1] }, { q: {} });
    expect(request.url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(request.headers.authorization).toBe("Bearer or");
    expect(request.headers["HTTP-Referer"]).toBe("https://github.com/masseater/cc-jev-teacher");
    expect(JSON.parse(request.body)).toEqual({
      provider: { data_collection: "deny" },
      user: "cloud:app:script-edit",
      session_id: "s1",
      model: "respan/span-01-lite",
      state: "## goal\nship\n\n## history\n[1]",
      questions: { q: {} },
    });
  });

  it("keeps string state as it is", () => {
    expect(stateFor(jevBackend({ ...settings, openRouterKey: "or" }, origin), "plain")).toBe(
      "plain",
    );
  });
});

describe("moduleBackend", () => {
  const moduleOrigin = { project: "app", hook: "compaction", sessionId: "s1" };

  it("reads the plugin options before the environment", () => {
    const backend = moduleBackend(
      { openrouter_api_key: "from-option", openrouter_model: "typesafe/jev-1.13" },
      { OPENROUTER_API_KEY: "from-env", GITHUB_ACTIONS: "true" },
      moduleOrigin,
    );
    expect(backend.apiKey).toBe("from-option");
    expect(backend.model).toBe("typesafe/jev-1.13");
    expect(backend.extra.user).toBe("ci:app:compaction");
  });

  it("falls back to the environment", () => {
    expect(moduleBackend({}, { OPENROUTER_API_KEY: "from-env" }, moduleOrigin).apiKey).toBe(
      "from-env",
    );
    expect(moduleBackend({}, {}, moduleOrigin).apiKey).toBe("");
    expect(moduleBackend({ typesafe_api_key: "ts" }, {}, moduleOrigin).apiKey).toBe("");
  });
});
