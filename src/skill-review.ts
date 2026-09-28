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
    reason:
      "ファイルの先頭に --- で囲んだ frontmatter を置き、name と、どんなときに使うスキルかを書いた description を入れてください。",
  },
  missingFiles: {
    question: noul(
      "Does the skill link to or reference a relative file inside its own directory that is not in `files` (the files that exist in the skill's directory)? Paths in other repositories or projects, commands, and URLs do not count.",
    ),
    reason:
      "スキルのディレクトリにないファイルを参照しています。そのファイルを作るか、参照を外してください。",
  },
  reasons: {
    question: noul(
      "Does the skill explain why a rule exists (background, motivation, rationale) where the rule would be clear without the explanation, instead of only telling the reader what to do?",
    ),
    reason:
      "ルールの理由や背景の説明が長いです。何をすればいいかがすぐ分かるように、短く自然な日本語に書き直してください。",
  },
  filler: {
    question: noul(
      "Does the skill contain prose that would not change any decision the reader makes, such as introductions, summaries, restatements of the same rule, or generic advice any competent engineer already follows? Concrete references such as library names, file paths, function names, and commands do not count.",
    ),
    reason:
      "読んでもやることが変わらない文（前置き、まとめ、同じことの繰り返し、当たり前の一般論）があります。何をすればいいかが伝わる自然な日本語に書き直してください。ライブラリ名やパス、関数名などの具体的な情報は残してください。",
  },
  restates: {
    question: noul(
      "Does the skill copy the content of other skills, types, READMEs, config files, or documentation instead of pointing to them by path or name?",
    ),
    reason:
      "ほかのスキルや型、README、設定ファイルの中身を書き写しています。書き写さずに、パスや名前で場所を示してください。",
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
      `${path} を、スキルの書き方に沿って直してください。\n${failed.join("\n")}`,
    );
  },
});

await runHook(hook);
