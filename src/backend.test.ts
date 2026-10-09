import { describe, expect, it } from "vite-plus/test";

import { jevBackend, moduleBackend, stateFor, systemOneRequest } from "./backend.ts";

const settings = { openRouterKey: "", typeSafeKey: "", openRouterModel: "", allowTraining: false };

describe("jevBackend", () => {
  it("sends to TypeSafe directly when only its key is set", () => {
    expect(jevBackend({ ...settings, typeSafeKey: "ts" })).toEqual({
      apiKey: "ts",
      baseURL: "https://api.typesafe.ai",
      model: "jev-latest",
      extra: {},
      textState: false,
    });
  });

  it("prefers OpenRouter, defaulting to Respan Span-01 Lite with data collection denied", () => {
    expect(jevBackend({ ...settings, openRouterKey: "or", typeSafeKey: "ts" })).toEqual({
      apiKey: "or",
      baseURL: "https://openrouter.ai/api",
      model: "respan/span-01-lite",
      extra: { provider: { data_collection: "deny" } },
      textState: true,
    });
  });

  it("sends structured state to non-Respan models and allows training only when asked", () => {
    const backend = jevBackend({
      ...settings,
      openRouterKey: "or",
      openRouterModel: "typesafe/jev-1.13",
      allowTraining: true,
    });
    expect(backend.textState).toBe(false);
    expect(backend.extra).toEqual({ provider: { data_collection: "allow" } });
  });
});

describe("systemOneRequest", () => {
  it("posts state as Markdown sections to Respan models", () => {
    const backend = jevBackend({ ...settings, openRouterKey: "or" });
    const request = systemOneRequest(backend, { goal: "ship", history: [1] }, { q: {} });
    expect(request.url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(request.headers.authorization).toBe("Bearer or");
    expect(JSON.parse(request.body)).toEqual({
      provider: { data_collection: "deny" },
      model: "respan/span-01-lite",
      state: "## goal\nship\n\n## history\n[1]",
      questions: { q: {} },
    });
  });

  it("keeps string state as it is", () => {
    expect(stateFor(jevBackend({ ...settings, openRouterKey: "or" }), "plain")).toBe("plain");
  });
});

describe("moduleBackend", () => {
  it("reads the plugin options before the environment", () => {
    const backend = moduleBackend(
      { openrouter_api_key: "from-option", openrouter_model: "typesafe/jev-1.13" },
      { OPENROUTER_API_KEY: "from-env" },
    );
    expect(backend.apiKey).toBe("from-option");
    expect(backend.model).toBe("typesafe/jev-1.13");
  });

  it("falls back to the environment", () => {
    expect(moduleBackend({}, { TYPESAFE_API_KEY: "from-env" }).apiKey).toBe("from-env");
    expect(moduleBackend({}, {}).apiKey).toBe("");
  });
});
