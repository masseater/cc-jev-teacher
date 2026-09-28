import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey } from "./hook.ts";

const hook = defineHook({
  trigger: { PreToolUse: { Bash: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { command } = context.input.tool_input;
    const failed = await failedOf(
      { command },
      {
        script: {
          question: noul(
            "When `command` runs, does it itself rewrite source code or document files on disk, which the assistant should edit directly instead? Judge by what actually happens when it runs: text handed to a program as input is data, not a file write. Commands that only read, run, test, check, or format, and commands that write only temporary, generated, or lock files, do not count.",
          ),
          reason:
            "数ファイル程度の編集にスクリプトを使っています。変更が見えて確かめられるよう、ファイルを直接編集してください。",
        },
      },
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(failed.join("\n"));
  },
});

await runHook(hook);
