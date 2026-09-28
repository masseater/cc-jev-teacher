import { existsSync, readFileSync } from "node:fs";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { clientOf, hasApiKey, SCRATCH, THRESHOLD } from "./hook.ts";
import { entriesOf, instructionOf } from "./transcript.ts";

const CONFIG =
  /(^|\/)(\.[^/]*rc(\.[a-z]+)?|[^/]*\.config\.[a-z]+|[^/]*config[^/]*\.(json|jsonc|ya?ml|toml)|tsconfig[^/]*\.json|package\.json|settings[^/]*\.json|biome\.jsonc?|\.[^/]*ignore|wrangler\.[a-z]+|alchemy\.run\.ts|Cargo\.toml|pyproject\.toml|Makefile|[^/]*\.fish|[^/]*\.env[^/]*)$/i;
const RELAX =
  /disable|ignore|nocheck|expect-error|skip|\boff\b|\bwarn|allow|\bfalse\b|\bany\b|--no-|bypass|exclude|optional|lenient|loose|timeout|threshold|limit|max|min/i;
const LIMIT = 6000;

const clip = (text: string) =>
  text.length > LIMIT ? `${text.slice(0, LIMIT)}\n...(truncated)` : text;

const hook = defineHook({
  trigger: { PreToolUse: { Write: true, Edit: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { input } = context;
    const path = input.tool_input.file_path;
    if (SCRATCH.test(path)) return context.success();
    let before: string;
    let after: string;
    if (input.tool_name === "Write") {
      before = existsSync(path) ? readFileSync(path, "utf8") : "";
      after = input.tool_input.content;
    } else {
      before = input.tool_input.old_string;
      after = input.tool_input.new_string;
    }
    if (before === after) return context.success();
    const beforeLines = new Set(before.split("\n"));
    const added = after
      .split("\n")
      .filter((line) => !beforeLines.has(line))
      .join("\n");
    if (!CONFIG.test(path) && !RELAX.test(added)) return context.success();
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
    if (answers.relax.noul < THRESHOLD || answers.asked.noul >= THRESHOLD) return context.success();
    return context.blockingError(
      `${path} の変更で設定・ルール・検査・制限を無効にしたり緩めたりしています。ユーザーがその緩和を指示していないので、設定はそのままにして、それが指摘している問題のほうを直してください。`,
    );
  },
});

await runHook(hook);
