import { readFileSync } from "node:fs";

import { noul } from "@typesafe-ai/sdk";

import { apiKey, clientOf } from "./client.ts";

type PreToolUseInput = {
  tool_input?: { command?: string };
};

const WRITES = /sed\s+-i|perl\s+-p?i|python3?\s|node\s+(-e|-)|>>?\s*[^\s&|]|\btee\b|\bmv\s|\bcp\s/;

const main = async () => {
  const input = JSON.parse(readFileSync(0, "utf8")) as PreToolUseInput;
  const command = input.tool_input?.command ?? "";
  if (!WRITES.test(command) || !apiKey) return;
  const { answers } = await clientOf().systemOne({
    state: { command },
    questions: {
      script: noul(
        "Does this shell command change the contents of source code or document files through a script (sed -i, perl -pi, python or node code, heredoc or redirection into a file) instead of editing them directly? Writing only to temporary or scratch directories, lock files, or generated output does not count.",
      ),
    },
  });
  if (answers.script.noul < 0.7) return;
  process.stderr.write(
    "数ファイル程度の編集にスクリプトを使っています。Edit / Write ツールで直接編集してください。",
  );
  process.exit(2);
};

main().catch((error: unknown) => {
  process.stderr.write(`script-edit skipped: ${String(error)}\n`);
});
