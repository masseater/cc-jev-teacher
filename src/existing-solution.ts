import { existsSync } from "node:fs";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey, SCRATCH } from "./hook.ts";
import { entriesOf, instructionOf, searchedOf, toolUsesOf } from "./transcript.ts";

const hook = defineHook({
  trigger: { PreToolUse: { Write: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const path = context.input.tool_input.file_path;
    if (existsSync(path) || SCRATCH.test(path)) return context.success();
    const entries = entriesOf(context.input.transcript_path);
    if (searchedOf(toolUsesOf(entries))) return context.success();
    const failed = await failedOf(
      { instruction: instructionOf(entries) },
      {
        build: {
          question: noul(
            "Does the instruction ask the assistant to build something new, such as a feature, tool, script, hook, library, or mechanism, rather than only fixing a bug, changing settings, explaining, proposing, or investigating?",
          ),
          reason:
            "新しく作る前に、既存のソリューション（ライブラリ・CLI・サービス・スキル・MCP）がこの世に無いかを調べてください。dont-it-yourself スキルに従い、検索して原文を読み、使えるものが無いと確かめてから作ってください。",
        },
      },
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(failed.join("\n"));
  },
});

await runHook(hook);
