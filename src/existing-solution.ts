import { existsSync, readFileSync } from "node:fs";

import { noul } from "@typesafe-ai/sdk";

import { apiKey, clientOf } from "./client.ts";
import { entriesOf, instructionOf, searchedOf } from "./transcript.ts";

type PreToolUseInput = {
  transcript_path: string;
  tool_input?: { file_path?: string };
};

const SCRATCH = /^(\/tmp\/|\/private\/|\/var\/folders\/)|\/(jobs|scratchpad|memory|projects)\//;

const main = async () => {
  const input = JSON.parse(readFileSync(0, "utf8")) as PreToolUseInput;
  const path = input.tool_input?.file_path ?? "";
  if (!path || existsSync(path) || SCRATCH.test(path) || !apiKey) return;
  const entries = entriesOf(input.transcript_path);
  if (searchedOf(entries)) return;
  const { answers } = await clientOf().systemOne({
    state: { instruction: instructionOf(entries) },
    questions: {
      build: noul(
        "Does the instruction ask the assistant to build something new, such as a feature, tool, script, hook, library, or mechanism, rather than only fixing a bug, changing settings, explaining, proposing, or investigating?",
      ),
    },
  });
  if (answers.build.noul < 0.7) return;
  process.stderr.write(
    "新しく作る前に、既存のソリューション（ライブラリ・CLI・サービス・スキル・MCP）がこの世に無いかを調べてください。dont-it-yourself スキルに従い、検索して原文を読み、使えるものが無いと確かめてから作ってください。",
  );
  process.exit(2);
};

main().catch((error: unknown) => {
  process.stderr.write(`existing-solution skipped: ${String(error)}\n`);
});
