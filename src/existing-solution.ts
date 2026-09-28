import { existsSync } from "node:fs";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey, isScratch } from "./hook.ts";
import { entriesOf, instructionOf, toolCallsOf, toolUsesOf } from "./transcript.ts";

const hook = defineHook({
  trigger: { PreToolUse: { Write: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const path = context.input.tool_input.file_path;
    if (existsSync(path) || isScratch(path)) return context.success();
    const entries = entriesOf(context.input.transcript_path);
    const failed = await failedOf(
      { instruction: instructionOf(entries), tool_calls: toolCallsOf(toolUsesOf(entries)) },
      {
        build: {
          question: noul(
            "Does the instruction ask the assistant to build something new, such as a feature, tool, script, hook, library, or mechanism (rather than only fixing a bug, changing settings, explaining, proposing, or investigating), while `tool_calls` show no search for an existing solution that already does it?",
          ),
          reason:
            "作る手間と保守を減らすため、新しく作る前に既存のソリューションが無いかを調べ、使えるものが無いと確かめてから作ってください。dont-it-yourself スキルに従ってください。",
        },
      },
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(failed.join("\n"));
  },
});

await runHook(hook);
