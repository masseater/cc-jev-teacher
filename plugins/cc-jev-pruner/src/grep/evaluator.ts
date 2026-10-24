import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";

import { noul, type JsonValue } from "@typesafe-ai/sdk";

import { type JevBackend, systemOneRequest } from "../backend.ts";
import { type createEvaluationCache, type CacheInput } from "./cache.ts";

export type EvaluationRequest = {
  state: JsonValue;
  questions: Record<string, { type: "boolean"; instructions: string }>;
};

type FailureKind = "authentication" | "request-limit" | "provider" | "cancelled" | "source-invalid";

export class EvaluationFailure extends Error {
  readonly kind: FailureKind;
  readonly splitEligible: boolean;
  readonly diagnostic?: { statusCode: number; message?: string };

  constructor(
    kind: FailureKind,
    splitEligible = false,
    diagnostic?: { statusCode: number; message?: string },
    message?: string,
  ) {
    super(message ?? `Jev evaluation failed: ${kind}`);
    this.name = "EvaluationFailure";
    this.kind = kind;
    this.splitEligible = splitEligible;
    if (diagnostic) this.diagnostic = diagnostic;
  }
}

/** A provider answer other than 2xx, with its body parsed when it was JSON. */
class ProviderError extends Error {
  readonly statusCode: number;
  readonly data: unknown;

  constructor(statusCode: number, data: unknown) {
    super(`Jev request failed (${statusCode})`);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// Jevgrep asks yes/no questions; System One calls them noul questions and answers with `noul`.
const probabilities = (data: unknown, ids: string[]): Record<string, number> => {
  const answers =
    data && typeof data === "object" && "answers" in data && data.answers
      ? (data.answers as Record<string, unknown>)
      : undefined;
  return Object.fromEntries(
    ids.map((id) => {
      const answer = answers?.[id];
      const probability =
        answer && typeof answer === "object" && "noul" in answer ? answer.noul : undefined;
      if (
        typeof probability !== "number" ||
        !Number.isFinite(probability) ||
        probability < 0 ||
        probability > 1
      )
        throw new Error("Invalid answer");
      return [id, probability];
    }),
  );
};

export function createEvaluator(options: {
  backend: JevBackend;
  cache?: ReturnType<typeof createEvaluationCache>;
  policyVersion?: string;
  fetch?: typeof fetch;
  signal: AbortSignal;
  requestLimit?: number;
  timeoutMs?: number;
  concurrency?: number;
  /** Called with each request body before it is sent, for the plugin's request log. */
  onRequest?: (body: string) => void;
}) {
  const { backend } = options;
  const concurrency = options.concurrency ?? 32;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("Concurrency must be a positive integer");
  let requests = 0;
  let cacheHits = 0;
  let cooldownUntil = 0;
  const authenticationFailure = new AbortController();
  function assertActive() {
    if (options.signal.aborted) throw new EvaluationFailure("cancelled");
    if (authenticationFailure.signal.aborted) throw new EvaluationFailure("authentication");
  }
  let active = 0;
  const waiting: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const stopped = AbortSignal.any([options.signal, authenticationFailure.signal]);
  stopped.addEventListener(
    "abort",
    () => {
      const kind = options.signal.aborted ? "cancelled" : "authentication";
      for (const request of waiting.splice(0)) request.reject(new EvaluationFailure(kind));
    },
    { once: true },
  );
  async function acquire() {
    assertActive();
    if (active < concurrency) active++;
    else await new Promise<void>((resolve, reject) => waiting.push({ resolve, reject }));
    return () => {
      const next = waiting.shift();
      if (next) next.resolve();
      else active--;
    };
  }
  async function send(request: EvaluationRequest, signal: AbortSignal) {
    const questions = Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => [id, noul(question.instructions)]),
    );
    const { url, ...init } = systemOneRequest(backend, request.state, questions);
    requests++;
    options.onRequest?.(init.body);
    const response = await (options.fetch ?? fetch)(url, { ...init, signal });
    if (response.status === 429) {
      const raw = response.headers.get("retry-after");
      const seconds = raw === null ? NaN : Number(raw);
      const date = raw === null ? NaN : Date.parse(raw);
      const wait =
        Number.isFinite(seconds) && seconds >= 0
          ? seconds * 1000
          : Number.isFinite(date)
            ? Math.max(0, date - Date.now())
            : 1000;
      cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
    }
    const data = parsed(await response.text());
    if (!response.ok) throw new ProviderError(response.status, data);
    return probabilities(data, Object.keys(request.questions));
  }
  return {
    get cacheHits() {
      return cacheHits;
    },
    get cacheIssues() {
      return options.cache?.stats().issues ?? [];
    },
    get requests() {
      return requests;
    },
    async evaluate(
      request: EvaluationRequest,
      policy?: { navigation?: boolean; beforeAttempt?: () => Promise<void> },
    ): Promise<Record<string, number>> {
      assertActive();
      const cacheInput: CacheInput = {
        request,
        namespace: {
          model: backend.model,
          provider: "openrouter",
          endpoint: backend.baseURL,
          protocol: "systemone-noul-1",
          policyVersion: options.policyVersion ?? "1",
          parserVersion: "tree-sitter-0.27.0-python-0.25.0-go-0.25.0-rust-0.24.0-ts-5.9.3",
          promptVersion: "unit-locators-1",
        },
      };
      const cached = await options.cache?.get(cacheInput);
      assertActive();
      if (
        cached &&
        Object.keys(cached).length === Object.keys(request.questions).length &&
        Object.keys(request.questions).every(
          (id) => typeof cached[id] === "number" && cached[id]! >= 0 && cached[id]! <= 1,
        )
      ) {
        await policy?.beforeAttempt?.();
        assertActive();
        cacheHits++;
        return cached;
      }
      const navigation = policy?.navigation === true;
      const multiple = Object.keys(request.questions).length > 1;
      let attemptLimit = navigation && multiple ? 1 : 2;
      for (let attempt = 0; attempt < attemptLimit; attempt++) {
        assertActive();
        if (requests >= (options.requestLimit ?? 50_000))
          throw new EvaluationFailure("request-limit");
        const release = await acquire();
        try {
          assertActive();
          // Wait before validating source and before starting the network timeout.
          // Recheck after validation: another worker may have set a cooldown meanwhile.
          for (;;) {
            const wait = cooldownUntil - Date.now();
            if (wait > 0) {
              try {
                await delay(Math.min(60_000, wait), undefined, { signal: stopped });
              } catch {
                assertActive();
                throw new EvaluationFailure("cancelled");
              }
              continue;
            }
            await policy?.beforeAttempt?.();
            assertActive();
            if (cooldownUntil > Date.now()) continue;
            break;
          }
          try {
            const scores = await send(
              request,
              AbortSignal.any([
                options.signal,
                authenticationFailure.signal,
                AbortSignal.timeout(timeoutMs),
              ]),
            );
            await options.cache?.put(cacheInput, scores);
            return scores;
          } catch (error) {
            assertActive();
            const status = error instanceof ProviderError ? error.statusCode : undefined;
            if (status === 401 || status === 403) {
              authenticationFailure.abort();
              throw new EvaluationFailure(
                "authentication",
                false,
                providerDiagnostic(error, backend.apiKey),
              );
            }
            if (requests >= (options.requestLimit ?? 50_000))
              throw new EvaluationFailure("request-limit");
            const name = error instanceof Error ? error.name : "unknown";
            // fetch rejects with a TypeError when the connection itself fails.
            const network = error instanceof TypeError;
            const transient =
              status === 408 ||
              status === 429 ||
              (typeof status === "number" && status >= 500 && status <= 599) ||
              name === "TimeoutError" ||
              network;
            if (navigation && status === 429) attemptLimit = Math.max(attemptLimit, 2);
            if ((navigation && !transient) || attempt + 1 === attemptLimit) {
              const diagnostic = providerDiagnostic(error, backend.apiKey);
              const description = diagnostic
                ? `HTTP ${diagnostic.statusCode}${diagnostic.message ? `: ${diagnostic.message}` : ""}`
                : name === "TimeoutError"
                  ? `Request timed out after ${timeoutMs} ms`
                  : network
                    ? "Network request failed (connection unavailable or reset)"
                    : "Invalid or incomplete provider response";
              throw new EvaluationFailure(
                "provider",
                navigation && multiple && transient && status !== 429,
                diagnostic,
                `${description} (max concurrent requests: ${concurrency})`,
              );
            }
          }
        } finally {
          release();
        }
      }
      throw new EvaluationFailure("provider");
    },
  };
}

// Only explicit text fields from a parsed provider error are suitable for user-facing diagnostics.
// Other fields can carry arbitrary detail objects, requests, or response bodies.
function providerDiagnostic(error: unknown, apiKey: string): EvaluationFailure["diagnostic"] {
  if (!(error instanceof ProviderError)) return undefined;
  const data: unknown = error.data;
  let message: unknown;
  if (data && typeof data === "object") {
    const nested = "error" in data ? data.error : undefined;
    message =
      ("message" in data && typeof data.message === "string" ? data.message : undefined) ??
      (typeof nested === "string"
        ? nested
        : nested && typeof nested === "object" && "message" in nested
          ? nested.message
          : undefined) ??
      ("detail" in data && typeof data.detail === "string" ? data.detail : undefined);
  }
  if (typeof message !== "string") return { statusCode: error.statusCode };
  const safe = stripVTControlCharacters(message)
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .trim();
  const redacted = apiKey ? safe.replaceAll(apiKey, "[redacted]") : safe;
  // A provider may split a credential with whitespace or invisible separators.
  if (apiKey && redacted.replace(/\s/gu, "").includes(apiKey))
    return { statusCode: error.statusCode };
  const text = redacted.slice(0, 500);
  return text ? { statusCode: error.statusCode, message: text } : { statusCode: error.statusCode };
}
