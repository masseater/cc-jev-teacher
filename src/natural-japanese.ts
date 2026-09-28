import { defineHook, runHook } from "cc-hooks-ts";

import { clientOf, hasApiKey, THRESHOLD } from "./hook.ts";
import { aiJapaneseQuestion, aiJapaneseReason } from "./japanese.ts";

const PROSE_FILE = /\.(md|mdx|markdown|txt)$/i;
const LIMIT = 6000;

const hook = defineHook({
  trigger: { PostToolUse: { Write: true, Edit: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { input } = context;
    const path = input.tool_input.file_path;
    if (!PROSE_FILE.test(path)) return context.success();
    const written =
      input.tool_name === "Write" ? input.tool_input.content : input.tool_input.new_string;
    const { answers } = await clientOf().systemOne({
      state: { file: path, text: written.slice(0, LIMIT) },
      questions: { aiJapanese: aiJapaneseQuestion },
    });
    if (answers.aiJapanese.noul < THRESHOLD) return context.success();
    return context.blockingError(`${path}: ${aiJapaneseReason}`);
  },
});

await runHook(hook);
