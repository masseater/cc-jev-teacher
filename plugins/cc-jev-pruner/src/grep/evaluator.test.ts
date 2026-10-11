import { describe, expect, it } from "vite-plus/test";

import { jevBackend } from "../backend.ts";
import { createEvaluator, EvaluationFailure } from "./evaluator.ts";

const backend = jevBackend(
  { openRouterKey: "secret-key", openRouterModel: "", allowTraining: false },
  { place: "local", project: "app", hook: "jevgrep", sessionId: "" },
);

const question = { useful: { type: "boolean" as const, instructions: "Is the source useful?" } };

const respond = (...responses: Response[]) => {
  const sent: Array<{ url: string; body: unknown }> = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(init.body as string) });
    return responses.shift() ?? Response.json({ error: "no more responses" }, { status: 500 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
};

describe("createEvaluator", () => {
  it("asks System One on OpenRouter a noul question and returns its probability", async () => {
    const { fetch, sent } = respond(
      Response.json({ answers: { useful: { type: "noul", noul: 0.8 } } }),
    );
    const bodies: string[] = [];
    const evaluator = createEvaluator({
      backend,
      fetch,
      signal: new AbortController().signal,
      onRequest: (body) => bodies.push(body),
    });

    const scores = await evaluator.evaluate({ state: { query: "events" }, questions: question });

    expect(scores).toEqual({ useful: 0.8 });
    expect(sent[0]?.url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(sent[0]?.body).toMatchObject({
      model: "respan/span-01-lite",
      provider: { data_collection: "deny" },
      user: "local:app:jevgrep",
      questions: { useful: { type: "noul", instructions: "Is the source useful?" } },
    });
    expect(bodies).toHaveLength(1);
    expect(evaluator.requests).toBe(1);
  });

  it("retries a server error once and then succeeds", async () => {
    const { fetch } = respond(
      Response.json({ error: "busy" }, { status: 503 }),
      Response.json({ answers: { useful: { type: "noul", noul: 0.3 } } }),
    );
    const evaluator = createEvaluator({ backend, fetch, signal: new AbortController().signal });

    expect(await evaluator.evaluate({ state: {}, questions: question })).toEqual({ useful: 0.3 });
    expect(evaluator.requests).toBe(2);
  });

  it("fails as authentication on 401 and keeps the key out of the diagnostic", async () => {
    const { fetch } = respond(
      Response.json({ error: { message: "bad key secret-key" } }, { status: 401 }),
    );
    const evaluator = createEvaluator({ backend, fetch, signal: new AbortController().signal });

    const failure = await evaluator.evaluate({ state: {}, questions: question }).catch((e) => e);

    expect(failure).toBeInstanceOf(EvaluationFailure);
    expect(failure.kind).toBe("authentication");
    expect(failure.diagnostic).toEqual({ statusCode: 401, message: "bad key [redacted]" });
  });

  it("never turns an answer without a probability into a score", async () => {
    const { fetch } = respond(
      Response.json({ answers: {} }),
      Response.json({ answers: { useful: { type: "noul", noul: 2 } } }),
    );
    const evaluator = createEvaluator({ backend, fetch, signal: new AbortController().signal });

    const failure = await evaluator.evaluate({ state: {}, questions: question }).catch((e) => e);

    expect(failure).toBeInstanceOf(EvaluationFailure);
    expect(failure.kind).toBe("provider");
  });
});
