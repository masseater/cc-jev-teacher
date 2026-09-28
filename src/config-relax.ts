import { existsSync, readFileSync } from "node:fs";

import { noul } from "@typesafe-ai/sdk";

import { apiKey, clientOf } from "./client.ts";
import { entriesOf, instructionOf } from "./transcript.ts";

type PreToolUseInput = {
  transcript_path: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
  };
};

const SCRATCH = /^(\/tmp\/|\/private\/|\/var\/folders\/)|\/(jobs|scratchpad|memory|projects)\//;
const CONFIG =
  /(^|\/)(\.[^/]*rc(\.[a-z]+)?|[^/]*\.config\.[a-z]+|[^/]*config[^/]*\.(json|jsonc|ya?ml|toml)|tsconfig[^/]*\.json|package\.json|settings[^/]*\.json|biome\.jsonc?|\.[^/]*ignore|wrangler\.[a-z]+|alchemy\.run\.ts|Cargo\.toml|pyproject\.toml|Makefile|[^/]*\.fish|[^/]*\.env[^/]*)$/i;
const RELAX =
  /disable|ignore|nocheck|expect-error|skip|\boff\b|\bwarn|allow|\bfalse\b|\bany\b|--no-|bypass|exclude|optional|lenient|loose|timeout|threshold|limit|max|min/i;
const LIMIT = 6000;

const clip = (text: string) =>
  text.length > LIMIT ? `${text.slice(0, LIMIT)}\n...(truncated)` : text;

const main = async () => {
  const input = JSON.parse(readFileSync(0, "utf8")) as PreToolUseInput;
  const path = input.tool_input?.file_path ?? "";
  if (!path || SCRATCH.test(path) || !apiKey) return;
  const before =
    input.tool_name === "Write"
      ? existsSync(path)
        ? readFileSync(path, "utf8")
        : ""
      : (input.tool_input?.old_string ?? "");
  const after =
    input.tool_name === "Write"
      ? (input.tool_input?.content ?? "")
      : (input.tool_input?.new_string ?? "");
  if (before === after) return;
  const beforeLines = new Set(before.split("\n"));
  const added = after
    .split("\n")
    .filter((line) => !beforeLines.has(line))
    .join("\n");
  if (!CONFIG.test(path) && !RELAX.test(added)) return;
  const { answers } = await clientOf().systemOne({
    state: {
      instruction: instructionOf(entriesOf(input.transcript_path)),
      file: path,
      before: clip(before) || "(new file)",
      after: clip(after),
    },
    questions: {
      relax: noul(
        "Does this change from before to after disable, remove, downgrade, or loosen a setting, rule, check, guard, or limit? Examples: turning a lint or type rule off or from error to warn, adding eslint-disable / ts-ignore / ts-expect-error / nocheck / noqa / skip comments, adding paths to ignore or exclude lists, deleting a validation or hook, lowering a threshold or strictness, raising a limit or timeout to make something pass, widening an allowlist or permission, or turning a security or safety option off. Adding new checks, tightening, or pure refactoring with the same behavior does not count.",
      ),
      asked: noul(
        "Does the instruction explicitly ask to disable, remove, or loosen this specific setting, rule, check, or limit?",
      ),
    },
  });
  if (answers.relax.noul < 0.7 || answers.asked.noul >= 0.7) return;
  process.stderr.write(
    `${path} の変更で設定・ルール・検査・制限を無効にしたり緩めたりしています。ユーザーがその緩和を指示していないので、設定はそのままにして、それが指摘している問題のほうを直してください。`,
  );
  process.exit(2);
};

main().catch((error: unknown) => {
  process.stderr.write(`config-relax skipped: ${String(error)}\n`);
});
