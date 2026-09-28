import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey } from "./hook.ts";

const WRITES = /sed\s+-i|perl\s+-p?i|python3?\s|node\s+(-e|-)|>>?\s*[^\s&|]|\btee\b|\bmv\s|\bcp\s/;

const hook = defineHook({
  trigger: { PreToolUse: { Bash: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { command } = context.input.tool_input;
    if (!WRITES.test(command)) return context.success();
    const failed = await failedOf(
      { command },
      {
        script: {
          question: noul(
            "Does this shell command change the contents of source code or document files through a script (sed -i, perl -pi, python or node code, heredoc or redirection into a file) instead of editing them directly? Writing only to temporary or scratch directories, lock files, or generated output does not count.",
          ),
          reason:
            "数ファイル程度の編集にスクリプトを使っています。Edit / Write ツールで直接編集してください。",
        },
      },
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(failed.join("\n"));
  },
});

await runHook(hook);
