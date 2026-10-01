import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey } from "./jev-checks.ts";

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
            "The assistant uses a shell command to edit source code or documents: running `command` changes the text inside existing source or document files. Commands that only read, run, test, check, format, or commit, and commands that write only temporary, generated, or lock files, do not count. Text handed to a program as input (such as a commit message) is data, not a file write.",
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
