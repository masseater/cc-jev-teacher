// src/stop-report-check.ts
import { readFileSync as readFileSync2 } from "node:fs";

// node_modules/.pnpm/@typesafe-ai+sdk@0.6.0/node_modules/@typesafe-ai/sdk/dist/index.mjs
var requestIdFrom = (headers) => headers.get("x-typesafe-request-id") ?? void 0;
var APIPromise = class APIPromise2 extends Promise {
  #responsePromise;
  #parseResponse;
  #parsed;
  constructor(responsePromise, parseResponse) {
    super((resolve) => resolve(void 0));
    this.#responsePromise = responsePromise;
    this.#parseResponse = parseResponse;
  }
  /**
  * Resolves to the raw `Response` without parsing the body. SDK requests buffer the full
  * body under the request timeout before handoff; reading it afterwards is caller-owned.
  * The caller owns the body; don't also `await` the parsed result on the same promise.
  */
  asResponse() {
    return this.#responsePromise;
  }
  /** Return the parsed result, HTTP response, and request ID. */
  async withResponse() {
    const [data, response] = await Promise.all([this.#parse(), this.#responsePromise]);
    return {
      data,
      response,
      requestId: requestIdFrom(response.headers)
    };
  }
  /** Transform the parsed result, sharing the HTTP response and a single body parse. */
  map(fn) {
    return new APIPromise2(this.#responsePromise, () => this.#parse().then(fn));
  }
  #parse() {
    this.#parsed ??= this.#responsePromise.then(this.#parseResponse);
    return this.#parsed;
  }
  then(onfulfilled, onrejected) {
    return this.#parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.#parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.#parse().finally(onfinally);
  }
};
var ENV = {
  /** Required API key; used when `apiKey` is omitted. */
  apiKey: "TYPESAFE_API_KEY",
  /** API root; defaults to `https://api.typesafe.ai`. */
  baseURL: "TYPESAFE_BASE_URL",
  /** Default model name; defaults to `jev-latest`. */
  defaultModel: "TYPESAFE_DEFAULT_MODEL",
  /** Log level; defaults to `warn`. */
  logLevel: "TYPESAFE_LOG_LEVEL"
};
var readEnv = (name) => {
  if (typeof process === "undefined" || !process.env) return void 0;
  return process.env[name]?.trim() || void 0;
};
var fromCodeOrEnv = (fromCode, envVar) => fromCode ?? readEnv(envVar);
var range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);
var DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  backoffInitialMs: 500,
  backoffMaxMs: 5e3,
  backoffJitter: 0.25,
  /** HTTP 408, 429, and 5xx responses. */
  httpStatuses: /* @__PURE__ */ new Set([
    408,
    429,
    ...range(500, 600)
  ]),
  respectRetryAfter: true,
  /** Maximum server retry delay before falling back to backoff. */
  maxRetryAfterMs: 6e4,
  apiConnectionError: true,
  apiTimeoutError: true
};
DEFAULT_RETRY_POLICY.maxRetries;
var isRetryableStatus = (status, policy = DEFAULT_RETRY_POLICY) => policy.httpStatuses.has(status);
var parseRetryAfter = (headers, now = Date.now()) => {
  const ms = Number(headers.get("retry-after-ms"));
  if (headers.has("retry-after-ms") && Number.isFinite(ms) && ms >= 0) return ms;
  const raw = headers.get("retry-after");
  if (raw === null) return void 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1e3 : void 0;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
};
var retryDelayMs = (attempt, headers, policy = DEFAULT_RETRY_POLICY, random = Math.random) => {
  if (policy.respectRetryAfter && headers !== void 0) {
    const retryAfter = parseRetryAfter(headers);
    if (retryAfter !== void 0 && retryAfter <= policy.maxRetryAfterMs) return retryAfter;
  }
  const exponential = Math.min(policy.backoffInitialMs * 2 ** attempt, policy.backoffMaxMs);
  return Math.round(exponential * (1 - random() * policy.backoffJitter));
};
var sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const onAbort = () => {
    clearTimeout(timer);
    reject(signal?.reason);
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
});
var TypeSafeError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
};
var isRecord = (value) => typeof value === "object" && value !== null;
var extractMessage = (body) => {
  if (typeof body === "string") return body || void 0;
  if (!isRecord(body)) return void 0;
  const { error, message, detail } = body;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof message === "string") return message;
  if (typeof detail === "string") return detail;
  if (isRecord(detail) && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail)) return describeValidationErrors(detail);
};
var describeValidationErrors = (errors) => {
  const parts = errors.flatMap((e) => {
    if (!isRecord(e) || typeof e.msg !== "string") return [];
    const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "";
    return [loc ? `${loc}: ${e.msg}` : e.msg];
  });
  return parts.length > 0 ? parts.join("; ") : void 0;
};
var MAX_RAW_BODY_IN_MESSAGE = 200;
var APIError = class APIError2 extends TypeSafeError {
  /** HTTP response status code. */
  status;
  /** HTTP response headers. */
  headers;
  /** Parsed JSON, response text, or `undefined` for an empty body. */
  body;
  /** Request ID from `x-typesafe-request-id`, or `undefined` when absent. */
  requestId;
  constructor(status, body, headers, message) {
    super(message ?? APIError2.describe(status, body));
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.requestId = requestIdFrom(headers);
  }
  static describe(status, body) {
    const detail = extractMessage(body);
    if (detail) return `${status} ${detail}`;
    if (body === void 0) return `${status} status code (no body)`;
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return `${status} ${raw.length > MAX_RAW_BODY_IN_MESSAGE ? `${raw.slice(0, MAX_RAW_BODY_IN_MESSAGE)}\u2026` : raw}`;
  }
  /** Create the error subclass for an HTTP status code. */
  static fromResponse(status, body, headers) {
    if (status === 400) return new BadRequestError(status, body, headers);
    if (status === 401) return new AuthenticationError(status, body, headers);
    if (status === 403) return new PermissionDeniedError(status, body, headers);
    if (status === 404) return new NotFoundError(status, body, headers);
    if (status === 422) return new UnprocessableEntityError(status, body, headers);
    if (status === 429) return new RateLimitError(status, body, headers);
    if (status >= 500) return new InternalServerError(status, body, headers);
    return new APIError2(status, body, headers);
  }
};
var BadRequestError = class extends APIError {
};
var AuthenticationError = class extends APIError {
};
var PermissionDeniedError = class extends APIError {
};
var NotFoundError = class extends APIError {
};
var UnprocessableEntityError = class extends APIError {
};
var RateLimitError = class extends APIError {
  /** Server retry delay in milliseconds, or `undefined` when absent or invalid. */
  retryAfterMs = parseRetryAfter(this.headers);
};
var InternalServerError = class extends APIError {
};
var APIConnectionError = class extends TypeSafeError {
  constructor(message = "Connection error.", options) {
    super(message, options);
  }
};
var APITimeoutError = class extends APIConnectionError {
  /** Configured timeout in milliseconds. */
  timeoutMs;
  constructor(timeoutMs, options) {
    super(`Request timed out after ${timeoutMs}ms.`, options);
    this.timeoutMs = timeoutMs;
  }
};
var APIUserAbortError = class extends TypeSafeError {
  constructor(message = "Request was aborted.", options) {
    super(message, options);
  }
};
var LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "off"
];
var DEFAULT_LOG_LEVEL = "warn";
var isLogLevel = (value) => LOG_LEVELS.includes(value);
var parseLogLevel = (value, source) => {
  if (isLogLevel(value)) return value;
  throw new TypeSafeError(`Invalid log level "${value}" from ${source}. Expected one of: ${LOG_LEVELS.join(", ")}.`);
};
var PREFIX = "[typesafe-sdk]";
var consoleLogger = {
  debug: (message, ...args) => console.debug(`${PREFIX} ${message}`, ...args),
  info: (message, ...args) => console.info(`${PREFIX} ${message}`, ...args),
  warn: (message, ...args) => console.warn(`${PREFIX} ${message}`, ...args),
  error: (message, ...args) => console.error(`${PREFIX} ${message}`, ...args)
};
var RANK = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  off: 4
};
var drop = () => {
};
var withLevel = (sink, level) => {
  const enabled = (at) => RANK[at] >= RANK[level];
  return {
    debug: enabled("debug") ? (message, ...args) => sink.debug(message, ...args) : drop,
    info: enabled("info") ? (message, ...args) => sink.info(message, ...args) : drop,
    warn: enabled("warn") ? (message, ...args) => sink.warn(message, ...args) : drop,
    error: enabled("error") ? (message, ...args) => sink.error(message, ...args) : drop
  };
};
var KEY_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key"
]);
var OPAQUE_HEADERS = /* @__PURE__ */ new Set(["cookie", "set-cookie"]);
var redactKey = (value) => {
  const [scheme, secret] = value.includes(" ") ? value.split(/\s+/, 2) : [void 0, value];
  const tail = secret && secret.length > 8 ? secret.slice(-4) : "";
  return `${scheme ? `${scheme} ` : ""}***${tail}`;
};
var redact = (name, value) => {
  const lower = name.toLowerCase();
  if (KEY_HEADERS.has(lower)) return redactKey(value);
  if (OPAQUE_HEADERS.has(lower)) return "***";
  return value;
};
var redactHeaders = (headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, redact(name, value)]));
var noul = (instructions = null, criteria) => ({
  type: "noul",
  instructions,
  criteria
});
var validateQuestions = (questions2) => {
  if (Object.keys(questions2).length === 0) throw new TypeSafeError("At least one question is required.");
  for (const [name, question] of Object.entries(questions2)) {
    if (question.type !== "score") continue;
    if (!Array.isArray(question.criteria)) throw new TypeSafeError(`Score question "${name}" has criteria that are not a list; score criteria must be a list of descriptions indexed by score from zero.`);
    if (question.criteria.length < 2) throw new TypeSafeError(`Score question "${name}" has ${question.criteria.length} criteria; at least two scores are required.`);
  }
};
var Models = class {
  #transport;
  constructor(transport) {
    this.#transport = transport;
  }
  /** List the models available to the account. */
  list(options = {}) {
    return this.#transport.request("GET", "/v1/models", options).map(unwrapModels);
  }
};
var unwrapModels = (wire) => {
  if (Array.isArray(wire?.models)) return wire.models;
  throw new TypeSafeError("Unexpected response shape from GET /v1/models; expected { models: [...] }.");
};
var g = globalThis;
var isBrowser = () => typeof g.window !== "undefined" && typeof g.window.document !== "undefined" && typeof g.navigator !== "undefined";
var describeRuntime = () => {
  const platform = g.process?.platform && g.process?.arch ? ` (${g.process.platform}; ${g.process.arch})` : "";
  if (g.Bun?.version) return `bun/${g.Bun.version}${platform}`;
  if (g.Deno?.version?.deno) return `deno/${g.Deno.version.deno}${platform}`;
  if (g.EdgeRuntime !== void 0) return "vercel-edge";
  if (g.navigator?.userAgent === "Cloudflare-Workers") return "cloudflare-workers";
  if (g.process?.versions?.node) return `node/${g.process.versions.node}${platform}`;
  if (isBrowser()) return "browser";
  return "unknown";
};
var VERSION = "0.6.0";
var missingApiKey = () => {
  throw new TypeSafeError(`No API key was provided. Pass \`apiKey\` to the TypeSafeClient constructor or set the ${ENV.apiKey} environment variable.`);
};
var missingFetch = () => {
  throw new TypeSafeError("No global `fetch` is available in this runtime. Pass a `fetch` implementation to the TypeSafeClient constructor.");
};
var refuseBrowser = () => {
  throw new TypeSafeError("TypeSafeClient is running in a browser, which would expose your API key to anyone using the page. Call the API from a server instead, or pass `dangerouslyAllowBrowser: true` if you understand the risk.");
};
var defaultFetch = (input, init) => globalThis.fetch(input, init);
var assertNonNegativeInteger = (name, value) => {
  if (!Number.isInteger(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative integer, got ${String(value)}.`);
  return value;
};
var assertPositiveMs = (name, value) => {
  if (!Number.isFinite(value) || value <= 0) throw new TypeSafeError(`\`${name}\` must be a positive number of milliseconds, got ${String(value)}.`);
  return value;
};
var assertNonNegativeMs = (name, value) => {
  if (!Number.isFinite(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative number of milliseconds, got ${String(value)}.`);
  return value;
};
var assertFraction = (name, value) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeSafeError(`\`${name}\` must be between 0 and 1, got ${String(value)}.`);
  return value;
};
var assertStatusSet = (name, statuses) => {
  for (const status of statuses) if (!Number.isInteger(status) || status < 100 || status > 999) throw new TypeSafeError(`\`${name}\` must contain HTTP status codes, got ${String(status)}.`);
  return statuses;
};
var resolveRetryPolicy = (base, overrides) => {
  const o = overrides ?? {};
  return {
    maxRetries: o.maxRetries === void 0 ? base.maxRetries : assertNonNegativeInteger("retry.maxRetries", o.maxRetries),
    backoffInitialMs: o.backoffInitialMs === void 0 ? base.backoffInitialMs : assertNonNegativeMs("retry.backoffInitialMs", o.backoffInitialMs),
    backoffMaxMs: o.backoffMaxMs === void 0 ? base.backoffMaxMs : assertNonNegativeMs("retry.backoffMaxMs", o.backoffMaxMs),
    backoffJitter: o.backoffJitter === void 0 ? base.backoffJitter : assertFraction("retry.backoffJitter", o.backoffJitter),
    httpStatuses: new Set(o.httpStatuses === void 0 ? base.httpStatuses : assertStatusSet("retry.httpStatuses", o.httpStatuses)),
    respectRetryAfter: o.respectRetryAfter ?? base.respectRetryAfter,
    maxRetryAfterMs: o.maxRetryAfterMs === void 0 ? base.maxRetryAfterMs : assertNonNegativeMs("retry.maxRetryAfterMs", o.maxRetryAfterMs),
    apiConnectionError: o.apiConnectionError ?? base.apiConnectionError,
    apiTimeoutError: o.apiTimeoutError ?? base.apiTimeoutError
  };
};
var isRetryableError = (err, policy) => {
  if (err instanceof APITimeoutError) return policy.apiTimeoutError;
  if (err instanceof APIConnectionError) return policy.apiConnectionError;
  return false;
};
var resolveLogLevel = (fromCode) => {
  if (fromCode !== void 0) return parseLogLevel(fromCode, "the `logLevel` option");
  const fromEnv = readEnv(ENV.logLevel);
  if (fromEnv !== void 0) return parseLogLevel(fromEnv, ENV.logLevel);
  return DEFAULT_LOG_LEVEL;
};
var stripTrailingSlashes = (url) => url.replace(/\/+$/, "");
var mergeHeaders = (...sources) => {
  const entries = /* @__PURE__ */ new Map();
  for (const source of sources) for (const [name, value] of Object.entries(source)) if (value === void 0) entries.delete(name.toLowerCase());
  else entries.set(name.toLowerCase(), [name, value]);
  return Object.fromEntries(entries.values());
};
var bufferResponse = async (response, signal) => {
  const reader = response.clone().body?.getReader();
  if (!reader) return;
  const cancel = () => {
    reader.cancel(signal.reason).catch(() => {
    });
    response.body?.cancel(signal.reason).catch(() => {
    });
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) cancel();
    signal.throwIfAborted();
    while (!(await reader.read()).done) signal.throwIfAborted();
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
};
var RUNTIME = describeRuntime();
var TypeSafeClient = class {
  /** API key excluded from serialization and public properties. */
  #apiKey;
  /** API root with trailing slashes removed. */
  baseURL;
  /** Model used when a request omits `model`. */
  defaultModel;
  /** Configured log verbosity. */
  logLevel;
  /** The configured logger, filtered to `logLevel`. */
  logger;
  /** Retry settings with constructor overrides applied. */
  retry;
  /** Timeout per attempt in milliseconds. */
  timeout;
  /** Additional headers sent with each request. */
  defaultHeaders;
  /** HTTP fetch implementation. */
  fetch;
  /** The models available to the account. */
  models;
  #requestCount = 0;
  /**
  * Create a client for the TypeSafe AI API.
  *
  * Explicit options take precedence over environment variables, then SDK defaults.
  * Empty or whitespace-only environment values are ignored.
  *
  * @throws {TypeSafeError} The API key is missing, configuration is invalid, or the runtime is unsupported.
  */
  constructor(config = {}) {
    if (isBrowser() && !config.dangerouslyAllowBrowser) refuseBrowser();
    this.#apiKey = fromCodeOrEnv(config.apiKey, ENV.apiKey) ?? missingApiKey();
    this.baseURL = stripTrailingSlashes(fromCodeOrEnv(config.baseURL, ENV.baseURL) ?? "https://api.typesafe.ai");
    this.defaultModel = fromCodeOrEnv(config.defaultModel, ENV.defaultModel) ?? "jev-latest";
    this.logLevel = resolveLogLevel(config.logLevel);
    this.logger = withLevel(config.logger ?? consoleLogger, this.logLevel);
    this.retry = resolveRetryPolicy(DEFAULT_RETRY_POLICY, config.retry);
    this.timeout = assertPositiveMs("timeout", config.timeout ?? 1e4);
    this.defaultHeaders = { ...config.defaultHeaders };
    if (config.fetch === void 0 && typeof globalThis.fetch !== "function") missingFetch();
    this.fetch = config.fetch ?? defaultFetch;
    const transport = {
      request: (method, path, options) => this.#request(method, path, options),
      defaultModel: this.defaultModel
    };
    this.models = new Models(transport);
  }
  /**
  * Answer named questions about text or structured state.
  *
  * @param request - State, questions, and an optional model override.
  * @param options - Per-call timeout, retry, headers, and cancellation settings.
  * @returns Answers typed by question name and criteria, with model and token usage.
  * @throws {TypeSafeError} Questions are empty, or score criteria are not a list of at least two entries.
  * @throws {APIError} The server returns a non-2xx response after retries.
  * @throws {APIConnectionError} The request cannot connect or times out after retries.
  * @throws {APIUserAbortError} The caller aborts the request.
  *
  * @example
  * ```ts
  * const { answers } = await client.systemOne({
  *   state: "I was charged twice. Please help.",
  *   questions: { billing: noul("Is this about billing?") },
  * });
  * console.log(answers.billing.noul);
  * ```
  */
  systemOne(request, options = {}) {
    validateQuestions(request.questions);
    const body = {
      ...request,
      model: request.model ?? this.defaultModel
    };
    return this.#request("POST", "/v1/systemone", {
      ...options,
      body
    });
  }
  /** Send a request and parse its response body. */
  #request(method, path, options = {}) {
    const resolved = {
      method,
      path,
      body: options.body,
      headers: mergeHeaders(this.defaultHeaders, options.headers ?? {}),
      signal: options.signal,
      timeout: options.timeout === void 0 ? this.timeout : assertPositiveMs("timeout", options.timeout),
      retry: resolveRetryPolicy(this.retry, options.retry)
    };
    const tag = `#${++this.#requestCount} ${method} ${path}`;
    return new APIPromise(this.fetchWithRetries(tag, resolved), async (res) => {
      const parsed = await parseBody(res);
      this.logger.debug(`${tag} <- body`, parsed);
      return parsed;
    });
  }
  /** Retry eligible failures, logging attempt summaries at `info` and headers and bodies at `debug`. */
  async fetchWithRetries(tag, req) {
    const url = `${this.baseURL}${req.path}`;
    const headers = mergeHeaders(req.headers, {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
      "User-Agent": `typesafe-sdk/${VERSION}`,
      "X-TypeSafe-SDK": `typesafe-sdk/${VERSION}`,
      "X-TypeSafe-Runtime": RUNTIME,
      "Content-Type": req.body === void 0 ? void 0 : "application/json",
      "X-TypeSafe-Retry-Count": void 0
    });
    const body = req.body === void 0 ? void 0 : JSON.stringify(req.body);
    for (let attempt = 0; ; attempt++) {
      const retriesLeft = req.retry.maxRetries - attempt;
      const attemptHeaders = attempt === 0 ? headers : {
        ...headers,
        "X-TypeSafe-Retry-Count": String(attempt)
      };
      this.logger.debug(`${tag} -> ${url}`, {
        headers: redactHeaders(attemptHeaders),
        body: req.body
      });
      const started = Date.now();
      let res;
      try {
        res = await this.attempt(tag, url, {
          method: req.method,
          headers: attemptHeaders,
          body
        }, req);
      } catch (err) {
        if (err instanceof APIUserAbortError || retriesLeft <= 0) throw err;
        if (!isRetryableError(err, req.retry)) throw err;
        await this.backOff(tag, attempt, retriesLeft, err.message, void 0, req);
        continue;
      }
      const requestId = requestIdFrom(res.headers);
      this.logger.info(`${tag} <- ${res.status} in ${Date.now() - started}ms${requestId ? ` (request ${requestId})` : ""}`);
      if (res.ok) return res;
      const errorBody = await parseBody(res);
      this.logger.debug(`${tag} <- error body`, errorBody);
      const error = APIError.fromResponse(res.status, errorBody, res.headers);
      if (retriesLeft <= 0 || !isRetryableStatus(res.status, req.retry)) throw error;
      await this.backOff(tag, attempt, retriesLeft, `${res.status}`, res.headers, req);
    }
  }
  /**
  * One HTTP round trip, including body delivery, with a timeout. The caller's signal and our
  * timer both abort the same controller; we check which fired to choose the error class.
  */
  async attempt(tag, url, init, { signal, timeout }) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const started = Date.now();
    const elapsed = () => `${Date.now() - started}ms`;
    try {
      const response = await this.fetch(url, {
        ...init,
        signal: controller.signal
      });
      await bufferResponse(response, controller.signal);
      return response;
    } catch (err) {
      if (signal?.aborted) {
        this.logger.info(`${tag} aborted by caller after ${elapsed()}`);
        throw new APIUserAbortError(void 0, { cause: err });
      }
      if (timedOut) {
        this.logger.info(`${tag} timed out after ${elapsed()}`);
        throw new APITimeoutError(timeout, { cause: err });
      }
      this.logger.info(`${tag} connection error after ${elapsed()}`, err);
      throw new APIConnectionError(err instanceof Error ? `Connection error: ${err.message}` : void 0, { cause: err });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
  /** Wait before retrying; caller cancellation throws `APIUserAbortError`. */
  async backOff(tag, attempt, retriesLeft, reason, headers, { retry, signal }) {
    const delay = retryDelayMs(attempt, headers, retry);
    const nth = attempt + 1;
    const total = attempt + retriesLeft;
    this.logger.info(`${tag} retrying in ${delay}ms (retry ${nth}/${total}) after ${reason}`);
    try {
      await sleep(delay, signal);
    } catch (err) {
      this.logger.info(`${tag} aborted by caller while waiting to retry`);
      throw new APIUserAbortError(void 0, { cause: err });
    }
  }
};
var parseBody = async (res) => {
  const text = await res.text();
  if (text.length === 0) return void 0;
  if ((res.headers.get("content-type") ?? "").includes("application/json")) try {
    return JSON.parse(text);
  } catch {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// src/client.ts
var apiKey = process.env.CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY || "";
var clientOf = () => new TypeSafeClient({ apiKey, timeout: 8e3, retry: { maxRetries: 2 } });

// src/transcript.ts
import { readFileSync } from "node:fs";
var SEARCH_TOOLS = /exa|websearch|webfetch|web_search|web_fetch|firecrawl|context7|jev_navigate/i;
var SEARCH_SKILLS = /dont-it-yourself|find-skills|firecrawl|deep-research/;
var SEARCH_COMMANDS = /\b(gh (api|search|repo view)|skills (find|add)|npm (view|search|info)|vp (info|view)|pnpm (view|info)|curl\s[^|]*https?:\/\/|jg )/;
var textOf = (content) => typeof content === "string" ? content : Array.isArray(content) ? content.filter(
  (part) => typeof part === "object" && part !== null && part.type === "text"
).map((part) => part.text).join("\n") : "";
var entriesOf = (transcriptPath) => readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
var promptOf = (entry) => {
  if (entry.type !== "user" || entry.isMeta || entry.message?.role !== "user") return null;
  const text = textOf(entry.message.content).trim();
  return text && !text.startsWith("<") && !text.startsWith("Stop hook feedback") ? text : null;
};
var instructionOf = (entries) => entries.reduce((turn, entry) => {
  if (entry.type === "user" && !entry.isMeta && entry.message?.role === "user") {
    const text = promptOf(entry);
    return text ? [text] : turn;
  }
  const queued = entry.attachment;
  return entry.type === "attachment" && queued?.type === "queued_command" && queued.humanTurn && typeof queued.prompt === "string" ? [...turn, queued.prompt.trim()] : turn;
}, []).join("\n\n");
var toolUsesOf = (entries) => entries.slice(entries.findLastIndex((entry) => promptOf(entry) !== null) + 1).flatMap(
  (entry) => entry.type === "assistant" && Array.isArray(entry.message?.content) ? entry.message.content : []
).filter((part) => part.type === "tool_use");
var searchedOf = (entries) => toolUsesOf(entries).some(
  (part) => SEARCH_TOOLS.test(part.name ?? "") || part.name === "Skill" && SEARCH_SKILLS.test(part.input?.skill ?? "") || part.name === "Bash" && SEARCH_COMMANDS.test(part.input?.command ?? "")
);

// src/stop-report-check.ts
var questions = {
  unfinished: noul(
    "Does the report state that some work the instruction asked the assistant to carry out now is still pending, such as not done, deferred, not deployed, or not verified? Ideas or proposals the instruction asked only to suggest, not to build, do not count. Questions for the user about security policy, billing, or a product choice do not count. Merely describing such states as a topic or feature does not count."
  ),
  leftovers: noul(
    "Does the report state that test data, test accounts, keys, tokens or temporary files created during this work still remain, or ask the user whether to verify or clean up? Merely describing such things as a topic or feature does not count."
  ),
  verbose: noul(
    "Is the report verbose: does it contain more than a brief statement of what happened to each instructed item, such as how the work was done, investigation steps, test results, or background explanation? The concrete numbers and their source that back a claim about a cause, frequency, latency, cost, or impact do not count. A short statement of where and how the result was verified (the environment and what was operated or checked) does not count."
  ),
  unmeasured: noul(
    "Does the report claim a cause, frequency, rate, latency, cost, size, or impact from guessing, using hedges such as probably, likely, seems, should, or maybe, or vague amounts such as many, often, fast, slow, or rarely, instead of the concrete number that was measured and where it came from (a log query, command output, or file)? Saying that something could not be measured, with the reason, does not count."
  ),
  isReport: noul(
    "Is the report a report on carrying out work the instruction asked for, rather than an answer or explanation to a question the user asked?"
  ),
  partial: noul(
    "Does the report admit that a problem it fixed also remains elsewhere, outside the part the assistant changed?"
  ),
  noPrevention: noul(
    "Does the report say it fixed a bug, mistake, or problem without also putting in place a measure that stops the same kind of problem from happening again (such as a lint rule, a type, a hook, a shared function, or a rule in AGENTS.md or a skill)?"
  ),
  symptomOnly: noul(
    "Does the report say it fixed a problem only by working around or hiding the symptom (for example retries, catching and ignoring errors, special cases, hiding the output, or manual data fixes) instead of removing the underlying cause?"
  ),
  memoryDurable: noul(
    "Did the assistant save to its own memory (see memory_writes, or the report) something meant to apply from now on, such as a rule, decision, policy, convention, or how-to, instead of only temporary context for the work in progress? memory_writes of (none) with a report that does not mention saving to memory does not count."
  ),
  askPermission: noul(
    "Is the assistant waiting for the user's permission to do something it could do by itself, such as installing, deploying, deleting, or running commands? Questions about billing, personal information, or product choices do not count."
  ),
  reissue: noul(
    "Does the response ask or advise the user to issue, rotate, reissue, or revoke an API key, token, or secret?"
  ),
  localhost: noul("Does the response tell the user to open a localhost or 127.0.0.1 URL?"),
  externalClaim: noul(
    "Does the response state facts about the latest versions, features, specifications, APIs, or prices of external software or services?"
  ),
  askedEnglish: noul("Does the instruction ask for the answer to be written in English?")
};
var thresholds = {
  unfinished: 0.8,
  leftovers: 0.7,
  verbose: 0.7,
  partial: 0.7,
  noPrevention: 0.7,
  symptomOnly: 0.8,
  unmeasured: 0.7,
  memoryDurable: 0.7,
  askPermission: 0.7,
  reissue: 0.7,
  localhost: 0.7,
  externalClaim: 0.7,
  askedEnglish: 0.7,
  isReport: 0.7
};
var reasons = {
  unfinished: "\u5B8C\u4E86\u5831\u544A\u306B\u3001\u6307\u793A\u306E\u3046\u3061\u672A\u5BFE\u5FDC\u30FB\u5148\u9001\u308A\u30FB\u672A\u691C\u8A3C\u306E\u9805\u76EE\u304C\u6B8B\u3063\u3066\u3044\u307E\u3059\u3002\u30E6\u30FC\u30B6\u30FC\u306E\u5224\u65AD\u304C\u8981\u308B\u3082\u306E\uFF08\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u306E\u65B9\u91DD\u3001\u8AB2\u91D1\u3001\u4ED5\u69D8\u306E\u9078\u629E\uFF09\u4EE5\u5916\u306F\u3001\u4ECA\u3053\u306E\u5834\u3067\u5BFE\u5FDC\u30FB\u691C\u8A3C\u3057\u3066\u304B\u3089\u5831\u544A\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  leftovers: "\u5B8C\u4E86\u5831\u544A\u306B\u3001\u691C\u8A3C\u3084\u5F8C\u7247\u4ED8\u3051\uFF08\u30C6\u30B9\u30C8\u30C7\u30FC\u30BF\u30FB\u30C6\u30B9\u30C8\u30E6\u30FC\u30B6\u30FC\u30FB\u30AD\u30FC\u3084\u4E00\u6642\u30C8\u30FC\u30AF\u30F3\u30FB\u4E00\u6642\u30D5\u30A1\u30A4\u30EB\uFF09\u306E\u6B8B\u308A\u3084\u3001\u305D\u308C\u3092\u3084\u308B\u304B\u306E\u78BA\u8A8D\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u3059\u3002\u78BA\u8A8D\u3092\u53D6\u3089\u305A\u306B\u6700\u5F8C\u307E\u3067\u3084\u3063\u3066\u304B\u3089\u5831\u544A\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  english: "\u5FDC\u7B54\u306E\u5730\u306E\u6587\u304C\u82F1\u8A9E\u306B\u306A\u3063\u3066\u3044\u307E\u3059\u3002\u65E5\u672C\u8A9E\u3067\u66F8\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u30B3\u30FC\u30C9\u30FB\u8B58\u5225\u5B50\u30FB\u30D5\u30A1\u30A4\u30EB\u30D1\u30B9\u30FBUI \u6587\u8A00\u306E\u5F15\u7528\u306F\u539F\u6587\u306E\u307E\u307E\u3067\u304B\u307E\u3044\u307E\u305B\u3093\u3002",
  partial: "\u5831\u544A\u306B\u3001\u76F4\u3057\u305F\u554F\u984C\u304C\u4ED6\u306E\u7B87\u6240\u306B\u3082\u6B8B\u3063\u3066\u3044\u308B\u3068\u66F8\u304B\u308C\u3066\u3044\u307E\u3059\u3002\u5171\u901A\u306E\u5834\u6240\u3067\u76F4\u3059\u304B\u3001\u540C\u3058\u554F\u984C\u3092\u6301\u3064\u7B87\u6240\u3092\u3059\u3079\u3066\u76F4\u3057\u3066\u304B\u3089\u5831\u544A\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u4ED6\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u7DE8\u96C6\u4E2D\u306E\u30D5\u30A1\u30A4\u30EB\u306A\u3089\u3001\u76F8\u8AC7\u3057\u3066\u76F4\u3057\u5207\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
  symptomOnly: "\u75C7\u72B6\u3092\u56DE\u907F\u30FB\u96A0\u3059\u3060\u3051\u306E\u76F4\u3057\u65B9\u306B\u306A\u3063\u3066\u3044\u3066\u3001\u6839\u672C\u7684\u306A\u539F\u56E0\u304C\u89E3\u6C7A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u539F\u56E0\u3092\u7A81\u304D\u6B62\u3081\u3066\u53D6\u308A\u9664\u3044\u3066\u304B\u3089\u5831\u544A\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  noPrevention: "\u76F4\u3057\u305F\u554F\u984C\u306B\u518D\u767A\u9632\u6B62\u7B56\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u540C\u3058\u7A2E\u985E\u306E\u554F\u984C\u304C\u8D77\u304D\u306A\u3044\u3088\u3046\u3001lint\u30FB\u578B\u30FBhook\u30FB\u5171\u901A\u306E\u95A2\u6570\u30FBAGENTS.md \u3084\u30B9\u30AD\u30EB\u306E\u6C7A\u307E\u308A\u306A\u3069\u3067\u9632\u3050\u4ED5\u7D44\u307F\u3092\u5165\u308C\u3001\u5831\u544A\u306B\u66F8\u304D\u8DB3\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  verbose: "\u5831\u544A\u304C\u5197\u9577\u3067\u3059\u3002\u6307\u793A\u3055\u308C\u305F\u5404\u9805\u76EE\u3092\u4ECA\u3069\u3046\u3057\u305F\u304B\u3068\u3001\u52D5\u4F5C\u78BA\u8A8D\u3092\u3069\u3053\u3067\u3069\u3046\u3057\u305F\u304B\u3060\u3051\u3092\u3001\u7C21\u6F54\u306B\u66F8\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u4F5C\u696D\u306E\u7D4C\u7DEF\u30FB\u8ABF\u3079\u65B9\u30FB\u5F8C\u7247\u4ED8\u3051\u306E\u624B\u9806\u306F\u66F8\u304B\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002",
  unmeasured: "\u63A8\u6E2C\u3084\u66D6\u6627\u306A\u91CF\uFF08\u304A\u305D\u3089\u304F\u30FB\u301C\u306E\u306F\u305A\u30FB\u591A\u3044\u30FB\u901F\u3044 \u306A\u3069\uFF09\u3067\u66F8\u3044\u3066\u3044\u307E\u3059\u3002\u539F\u56E0\u30FB\u983B\u5EA6\u30FB\u30EC\u30A4\u30C6\u30F3\u30B7\u30FB\u8CBB\u7528\u30FB\u5F71\u97FF\u306F\u3001\u5B9F\u969B\u306B\u8A08\u6E2C\u3057\u305F\u5177\u4F53\u7684\u306A\u6570\u5024\u3068\u3001\u305D\u306E\u51FA\u3069\u3053\u308D\uFF08\u30ED\u30B0\u306E\u30AF\u30A8\u30EA\u30FB\u30B3\u30DE\u30F3\u30C9\u306E\u51FA\u529B\u30FB\u30D5\u30A1\u30A4\u30EB\uFF09\u3092\u6DFB\u3048\u3066\u66F8\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8A08\u6E2C\u3067\u304D\u306A\u304B\u3063\u305F\u3082\u306E\u306F\u3001\u8A08\u6E2C\u3067\u304D\u306A\u304B\u3063\u305F\u3053\u3068\u3068\u7406\u7531\u3092\u66F8\u3044\u3066\u304F\u3060\u3055\u3044\u3002",
  askPermission: "\u81EA\u5206\u3067\u3067\u304D\u308B\u3053\u3068\u306B\u30E6\u30FC\u30B6\u30FC\u306E\u8A31\u53EF\u3092\u6C42\u3081\u3066\u3044\u307E\u3059\u3002\u8AB2\u91D1\u30FB\u500B\u4EBA\u60C5\u5831\u30FB\u4ED5\u69D8\u306E\u9078\u629E\u4EE5\u5916\u306F\u805E\u304B\u305A\u306B\u5B9F\u884C\u3057\u3001\u7D50\u679C\u3092\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  reissue: "\u30AD\u30FC\u3084\u30C8\u30FC\u30AF\u30F3\u306E\u767A\u884C\u30FB\u518D\u767A\u884C\u30FB\u7121\u52B9\u5316\u3092\u30E6\u30FC\u30B6\u30FC\u306B\u983C\u3093\u3067\u3044\u307E\u3059\u3002\u5FC5\u8981\u306A\u30AD\u30FC\u306F fish \u95A2\u6570\uFF08cf-token\u30FBoai-api \u306A\u3069\uFF09\u3067\u81EA\u5206\u3067\u767A\u884C\u3057\u3001\u518D\u767A\u884C\u3092\u52E7\u3081\u308B\u6587\u306F\u6D88\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  localhost: "\u30E6\u30FC\u30B6\u30FC\u306B localhost \u306E URL \u3092\u6848\u5185\u3057\u3066\u3044\u307E\u3059\u3002\u30E6\u30FC\u30B6\u30FC\u306F\u3053\u306E\u30DE\u30B7\u30F3\u306E\u753B\u9762\u3092\u898B\u3089\u308C\u306A\u3044\u306E\u3067\u3001--host 0.0.0.0 \u306A\u3069\u3067\u516C\u958B\u3057\u3001\u3053\u306E\u30DE\u30B7\u30F3\u306E IP \u30A2\u30C9\u30EC\u30B9\u4ED8\u304D\u306E URL \u3092\u6848\u5185\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  unsourced: "\u5916\u90E8\u306E\u30BD\u30D5\u30C8\u30A6\u30A7\u30A2\u3084\u30B5\u30FC\u30D3\u30B9\u306E\u6700\u65B0\u306E\u4ED5\u69D8\u30FB\u30D0\u30FC\u30B8\u30E7\u30F3\u30FB\u6599\u91D1\u306A\u3069\u3092\u3001\u3053\u306E\u30BF\u30FC\u30F3\u3067\u8ABF\u3079\u305A\u306B\u66F8\u3044\u3066\u3044\u307E\u3059\u3002\u691C\u7D22\u3057\u3066\u539F\u6587\u3092\u8AAD\u307F\u3001\u78BA\u304B\u3081\u3066\u304B\u3089\u66F8\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  memoryDurable: "\u4ECA\u5F8C\u3082\u52B9\u304F\u6C7A\u307E\u308A\u30FB\u5224\u65AD\u30FB\u65B9\u91DD\u30FB\u624B\u9806\u3092\u30E1\u30E2\u30EA\u306B\u66F8\u3044\u3066\u3044\u307E\u3059\u3002\u30E1\u30E2\u30EA\u306F\u4ECA\u306E\u4F5C\u696D\u306E\u9593\u3060\u3051\u306E\u4E00\u6642\u7684\u306A\u60C5\u5831\u306B\u9650\u308A\u3001\u4ECA\u5F8C\u3082\u5B88\u308B\u3082\u306E\u306F\u30EA\u30DD\u30B8\u30C8\u30EA\uFF08AGENTS.md\u30FB\u30B9\u30AD\u30EB\u30FB\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\uFF09\u306B\u66F8\u3044\u3066\u3001\u30E1\u30E2\u30EA\u304B\u3089\u306F\u6D88\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
};
var JAPANESE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
var WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
var englishOf = (report) => {
  const lines = report.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, "").replace(/https?:\/\/\S+/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  const english = lines.filter((line) => !JAPANESE.test(line) && (line.match(WORD) ?? []).length >= 4).reduce((sum, line) => sum + line.length, 0);
  return total > 0 && english / total >= 0.5;
};
var memoryWritesOf = (entries) => toolUsesOf(entries).filter(
  (part) => (part.name === "Write" || part.name === "Edit") && /\/memory\//.test(part.input?.file_path ?? "")
).map((part) => `${part.input?.file_path}
${part.input?.content ?? part.input?.new_string ?? ""}`).join("\n\n");
var main = async () => {
  const input = JSON.parse(readFileSync2(0, "utf8"));
  const report = input.last_assistant_message?.trim();
  if (!report || !apiKey) return;
  const client = clientOf();
  const entries = entriesOf(input.transcript_path);
  const state = {
    instruction: instructionOf(entries),
    report,
    memory_writes: memoryWritesOf(entries) || "(none)"
  };
  const english = englishOf(report);
  if (input.stop_hook_active) {
    if (!english) return;
    const { answers: answers2 } = await client.systemOne({
      state,
      questions: { askedEnglish: questions.askedEnglish }
    });
    if (answers2.askedEnglish.noul >= thresholds.askedEnglish) return;
    process.stderr.write(`- ${reasons.english}`);
    process.exit(2);
  }
  const { answers } = await client.systemOne({ state, questions });
  const hit = (key) => key === "english" ? english : answers[key].noul >= thresholds[key];
  const searched = searchedOf(entries);
  const failed = [
    "unfinished",
    "leftovers",
    "partial",
    "symptomOnly",
    "noPrevention",
    "unmeasured",
    "memoryDurable",
    "askPermission",
    "reissue",
    "localhost",
    "unsourced",
    "english",
    "verbose"
  ].filter(
    (key) => key === "unsourced" ? hit("externalClaim") && !searched : hit(key) && !(key === "english" && hit("askedEnglish")) && !(key === "verbose" && !hit("isReport"))
  );
  if (failed.length === 0) return;
  process.stderr.write(failed.map((key) => `- ${reasons[key]}`).join("\n"));
  process.exit(2);
};
main().catch((error) => {
  process.stderr.write(`stop-report-check skipped: ${String(error)}
`);
});
