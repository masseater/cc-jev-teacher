import type { On, PluginOptions, Register, SessionMessage } from "claude-code";

import { type JevBackend, moduleBackend, systemOneRequest } from "../backend.ts";
import { estimateTokens, parseJevResponse } from "./jev.js";
import {
  classifyOutput,
  exceedsOutputThreshold,
  looksBinary,
  MIN_OUTPUT_TOKENS,
  recoveryFooter,
  trimOutput,
} from "./output.js";
import type { TrimOutputResult } from "./output.js";
import type { JevAsker } from "./jev.js";
import { looksSecret } from "./secrets.js";
import {
  appendedLog,
  count,
  REQUEST_LOG,
  REQUEST_LOG_IGNORE,
  requestLine,
  tally,
} from "../request-log.ts";
import { classifyInformation } from "./retention.js";
import type { InformationCategory } from "./retention.js";

export { looksSecret } from "./secrets.js";

const ARCHIVE_DIR = ".claude/fast-jev-output";
const DEFAULT_MAX_SCORING_REQUESTS = 11;
const VISIBLE_CHARS_PER_REQUEST = 192;
const DEFAULTS = {
  persistedMaxChars: 8_000,
  chunkLines: 20,
  keepThreshold: 0.5,
  maxStateTokens: 25_000,
  minTokens: MIN_OUTPUT_TOKENS,
};

export type HookFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type HookFetchResponse = {
  status: number;
  ok: boolean;
  text: string;
};

export type HookFetch = (url: string, init?: HookFetchInit) => Promise<HookFetchResponse>;

export type HookConfig = {
  chunkChars?: number;
  diagnostics?: boolean;
  chunkLines: number;
  keepThreshold: number;
  maxStateTokens: number;
  maxScoringRequests?: number;
  minTokens: number;
  persistedOutputs: boolean;
  persistedMaxChars: number;
};

function optionNumber(options: PluginOptions, key: string, fallback: number): number {
  const value = options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function resolveHookConfig(options: PluginOptions): HookConfig {
  const config: HookConfig = {
    chunkLines: optionNumber(options, "chunkLines", DEFAULTS.chunkLines),
    keepThreshold: optionNumber(options, "keepThreshold", DEFAULTS.keepThreshold),
    maxStateTokens: optionNumber(options, "maxStateTokens", DEFAULTS.maxStateTokens),
    minTokens: Math.max(MIN_OUTPUT_TOKENS, optionNumber(options, "minTokens", DEFAULTS.minTokens)),
    persistedOutputs:
      typeof options.persistedOutputs === "boolean" ? options.persistedOutputs : true,
    persistedMaxChars: optionNumber(options, "persistedMaxChars", DEFAULTS.persistedMaxChars),
  };
  const chunkChars = optionNumber(options, "chunkChars", 0);
  if (chunkChars > 0) config.chunkChars = chunkChars;
  if (options.diagnostics === true) config.diagnostics = true;
  if (options.maxScoringRequests !== undefined) {
    config.maxScoringRequests = Math.max(
      0,
      Math.floor(optionNumber(options, "maxScoringRequests", DEFAULT_MAX_SCORING_REQUESTS)),
    );
  }
  return config;
}

/** A `JevAsker` over the engine's `$.http.fetch`, sending to the plugin's backend. */
export function jevAsker(fetchFn: HookFetch, backend: JevBackend): JevAsker {
  return {
    async ask(state, questions) {
      const request = systemOneRequest(backend, state, questions);
      const response = await fetchFn(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return parseJevResponse(response.status, response.ok, response.text);
    },
  };
}

export function goalFromMessages(messages: readonly SessionMessage[]): string {
  return messages
    .filter(
      (message) =>
        message.role === "user" &&
        message.text.trim().length > 0 &&
        (!message.toolResults || message.toolResults.length === 0),
    )
    .slice(-3)
    .map((message) => message.text.slice(0, 500))
    .join("\n");
}

async function backendOf(
  $: { env: { get: (name: string) => Promise<string | undefined> } },
  options: PluginOptions,
): Promise<JevBackend> {
  const env = {
    OPENROUTER_API_KEY: await $.env.get("OPENROUTER_API_KEY"),
    TYPESAFE_API_KEY: await $.env.get("TYPESAFE_API_KEY"),
    OPENROUTER_MODEL: await $.env.get("OPENROUTER_MODEL"),
    CC_JEV_TEACHER_ALLOW_TRAINING: await $.env.get("CC_JEV_TEACHER_ALLOW_TRAINING"),
  };
  return moduleBackend(options, env);
}

export const register: Register = (on: On, options: PluginOptions) => {
  const configured = resolveHookConfig(options);
  const archives = new Set<string>();

  on("tool.call", { tool: "Bash" }, async ($, event, next) => {
    const answer = await next(event);
    const started = Date.now();
    let decision =
      answer.deny !== undefined ? "denied" : answer.isError ? "tool_error" : "missing_result";
    let stage = "result";
    let requests = 0;
    const sent = tally();
    let model = "";
    let sourceChars: number | null = null;
    let sourceEstimatedTokens: number | null = null;
    let modelVisibleBudgetChars: number | null = null;
    let requestLimit: number | null = null;
    let pruning: TrimOutputResult | undefined;
    let informationCategory: InformationCategory | null = null;
    const original = answer.deny === undefined && !answer.isError ? answer.result : undefined;
    const hookStdoutCharsBefore = original?.stdout.length ?? null;
    let hookStdoutCharsAfter = hookStdoutCharsBefore;
    try {
      if (answer.deny !== undefined || answer.isError || !answer.result) return answer;
      decision = "archive_recovery";
      if ([...archives].some((path) => event.command.includes(path))) return answer;
      const record = answer.result;
      const persisted = record.persistedOutputPath;
      decision = "persisted_disabled";
      if (persisted && !configured.persistedOutputs) return answer;
      stage = "read_output";
      const output = persisted ? await $.fs.read(persisted) : record.stdout;
      sourceChars = output.length;
      if (configured.diagnostics) sourceEstimatedTokens = estimateTokens(output);
      decision = "below_threshold";
      if (!exceedsOutputThreshold(output, configured.minTokens)) return answer;
      decision = "binary";
      if (looksBinary(output)) return answer;
      informationCategory = classifyInformation(output);
      decision = "document";
      if (classifyOutput(event.command, output) === "document") return answer;
      const combined = persisted ? output : output + (record.stderr ? `\n${record.stderr}` : "");
      decision = "secret";
      if (looksSecret(event.command, combined)) return answer;
      stage = "credentials";
      const backend = await backendOf($, options);
      model = backend.model;
      decision = "missing_key";
      if (!backend.apiKey) return answer;
      stage = "history";
      const messages = await $.session.messages();
      const goal = goalFromMessages(messages);
      const path = persisted ?? `${ARCHIVE_DIR}/bash-${event.tool_use_id ?? Date.now()}.txt`;
      const footer = recoveryFooter(path);
      const maxChars = persisted
        ? Math.min(
            Math.max(0, configured.persistedMaxChars) || Infinity,
            answer.text?.length ?? Infinity,
          )
        : Infinity;
      if (Number.isFinite(maxChars)) modelVisibleBudgetChars = maxChars;
      const visibleChars = Math.min(maxChars, answer.text?.length ?? combined.length);
      requestLimit = Math.min(
        1 + (configured.maxScoringRequests ?? DEFAULT_MAX_SCORING_REQUESTS),
        Math.max(1, Math.ceil(visibleChars / VISIBLE_CHARS_PER_REQUEST)),
      );
      decision = "footer_exceeds_budget";
      if (maxChars <= footer.length) return answer;
      let archived: Promise<void> | undefined;
      const saveOutput = async (): Promise<void> => {
        if (!path || persisted) return;
        const ignorePath = `${ARCHIVE_DIR}/.gitignore`;
        if (!(await $.fs.exists(ignorePath))) await $.fs.write(ignorePath, "*\n");
        await $.fs.write(path, combined);
      };
      stage = "scoring";
      const trimmed = await trimOutput(
        {
          command: event.command,
          goal,
          messages,
          output,
          fullOutputPath: path,
        },
        jevAsker(async (url, init) => {
          stage = "archive";
          if (path) await (archived ??= saveOutput());
          stage = "scoring";
          requests += 1;
          count(sent, init?.body);
          const response = await $.http.fetch(url, init);
          return { status: response.status, ok: response.ok, text: response.text };
        }, backend),
        {
          minTokens: configured.minTokens,
          maxChars: Number.isFinite(maxChars) ? maxChars : 0,
          compactMarkers: true,
          chunkLines: configured.chunkLines,
          chunkChars: configured.chunkChars,
          keepThreshold: configured.keepThreshold,
          maxStateTokens: configured.maxStateTokens,
          maxScoringRequests: requestLimit - 1,
          onDecision: (reason) => {
            decision = reason;
          },
        },
      );
      pruning = trimmed;
      if (!trimmed.trimmed) return answer;
      stage = "publish";
      const stdout = trimmed.output;
      if (path) archives.add(path);
      const scores = trimmed.scores.map((score) => score.toFixed(2)).join(",");
      $.ui.log(
        `bash output: kept ${trimmed.kept}/${trimmed.chunks} chunks (${trimmed.charsBefore}→${stdout.length} chars) scores=${scores}`,
      );
      $.ui.toast(`trimmed Bash output ${trimmed.charsBefore}→${stdout.length} chars`, {
        timeoutMs: 8_000,
      });
      const result = { ...record, stdout };
      delete result.persistedOutputPath;
      delete result.persistedOutputSize;
      if (persisted) result.stderr = "";
      hookStdoutCharsAfter = stdout.length;
      return { result };
    } catch {
      decision = "hook_error";
      $.ui.log(`bash output trim skipped (stage=${stage})`);
      return answer;
    } finally {
      if (sent.requests > 0) {
        try {
          if (!(await $.fs.exists(REQUEST_LOG_IGNORE))) await $.fs.write(REQUEST_LOG_IGNORE, "*\n");
          const previous = (await $.fs.exists(REQUEST_LOG)) ? await $.fs.read(REQUEST_LOG) : "";
          await $.fs.write(
            REQUEST_LOG,
            appendedLog(previous, requestLine("bash-output", model, sent)),
          );
        } catch {
          $.ui.log("request log not written");
        }
      }
      if (configured.diagnostics) {
        try {
          $.ui.log(
            `fast-jev-output decision ${JSON.stringify({
              version: 1,
              toolUseId: event.tool_use_id ?? null,
              decision,
              stage,
              informationCategory,
              persisted: Boolean(original?.persistedOutputPath),
              modelVisibleCharsBefore: answer.text?.length ?? null,
              modelVisibleBudgetChars,
              sourceChars,
              sourceEstimatedTokens,
              hookStdoutCharsBefore,
              hookStdoutCharsAfter,
              hookStderrCharsBefore: original?.stderr.length ?? null,
              hookStderrCharsAfter:
                decision === "pruned" && original?.persistedOutputPath
                  ? 0
                  : (original?.stderr.length ?? null),
              chunks: pruning?.chunks ?? 0,
              kept: pruning?.kept ?? 0,
              dropped: pruning?.dropped ?? 0,
              withinChunkOnly: Boolean(pruning?.trimmed && pruning.dropped === 0),
              requests,
              requestLimit,
              elapsedMs: Date.now() - started,
            })}`,
          );
        } catch {
          // Diagnostics cannot change the tool result.
        }
      }
    }
  });
};
