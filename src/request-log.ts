import { estimateTokens } from "./bash-output/jev.ts";

export const REQUEST_LOG_DIR = ".claude/cc-jev-teacher";
export const REQUEST_LOG = `${REQUEST_LOG_DIR}/requests.jsonl`;
const MAX_LOG_CHARS = 1 << 20;

export type RequestTally = { requests: number; tokens: number };

export const tally = (): RequestTally => ({ requests: 0, tokens: 0 });

export const count = (sent: RequestTally, body: string | undefined) => {
  sent.requests += 1;
  sent.tokens += estimateTokens(body ?? "");
};

export const requestLine = (hook: string, model: string, sent: RequestTally) =>
  `${JSON.stringify({ at: new Date().toISOString(), hook, model, ...sent })}\n`;

export const REQUEST_LOG_IGNORE = `${REQUEST_LOG_DIR}/.gitignore`;

// The log with one more line, keeping only the newest part so it never grows past what $.fs can read.
export const appendedLog = (previous: string, line: string) =>
  `${previous.slice(-MAX_LOG_CHARS)}${line}`;
