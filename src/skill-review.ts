import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { clientOf, hasApiKey, THRESHOLD } from "./hook.ts";

const checks = {
  frontmatter: {
    question: noul(
      "Does the skill lack a YAML frontmatter block at the very top (between --- lines) that has both a non-empty `name` and a non-empty `description` saying when to use the skill?",
    ),
    reason: "先頭の frontmatter（--- で囲む）に、name と、いつ使うかを書いた description を入れてください。",
  },
  missingFiles: {
    question: noul(
      "Does the skill link to or reference a relative file inside its own directory that is not in `files` (the files that exist in the skill's directory)? Paths in other repositories or projects, commands, and URLs do not count.",
    ),
    reason: "スキルのディレクトリに存在しないファイルを参照しています。参照先を作るか、参照を消してください。",
  },
  reasons: {
    question: noul(
      "Does the skill explain why a rule exists (background, motivation, rationale) where the rule would be clear without the explanation, instead of only telling the reader what to do?",
    ),
    reason: "ルールの理由や背景を説明しています。無いと分かりにくいルール以外は理由を消し、何をするかだけを書いてください。",
  },
  filler: {
    question: noul(
      "Does the skill contain prose that would not change any decision the reader makes, such as introductions, summaries, restatements of the same rule, or generic advice any competent engineer already follows? Concrete references such as library names, file paths, function names, and commands do not count.",
    ),
    reason: "読み手の判断を変えない文（前置き・まとめ・同じルールの言い直し・誰でも守る一般論）があります。消してください。具体的なライブラリ名・パス・関数名は残してください。",
  },
  restates: {
    question: noul(
      "Does the skill copy the content of other skills, types, READMEs, config files, or documentation instead of pointing to them by path or name?",
    ),
    reason: "他のスキル・型・README・設定の内容を書き写しています。パスや名前で指し示してください。",
  },
};

const hook = defineHook({
  trigger: { PostToolUse: { Write: true, Edit: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const path = context.input.tool_input.file_path;
    if (!path.endsWith("/SKILL.md") || !existsSync(path)) return context.success();
    const { answers } = await clientOf().systemOne({
      state: {
        skill: readFileSync(path, "utf8"),
        files: readdirSync(dirname(path), { recursive: true }).join("\n"),
      },
      questions: {
        frontmatter: checks.frontmatter.question,
        missingFiles: checks.missingFiles.question,
        reasons: checks.reasons.question,
        filler: checks.filler.question,
        restates: checks.restates.question,
      },
    });
    const failed = (Object.keys(checks) as Array<keyof typeof checks>)
      .filter((key) => answers[key].noul >= THRESHOLD)
      .map((key) => `- ${checks[key].reason}`);
    if (failed.length === 0) return context.success();
    return context.blockingError(
      `${path} をスキルの書き方の観点で見直してください。\n${failed.join("\n")}`,
    );
  },
});

await runHook(hook);
