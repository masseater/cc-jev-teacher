import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { type Checks, failedOf, hasApiKey } from "./hook.ts";
import { aiJapanese } from "./japanese.ts";
import { repositoryOf } from "./repository.ts";

const PROSE_FILE = /\.(md|mdx|markdown|txt)$/i;
const DOCS = new Set(["README.md", "AGENTS.md", "CLAUDE.md"]);
const LIMIT = 12000;
const SKILL_FILE = /(^|\/)skills\/([^/]+)\/SKILL\.md$/;
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");

// Skills of the repository, the user, and installed plugins.
const skillsOf = (repositoryFiles: Array<string>) => {
  const installed = ["skills/*/SKILL.md", "plugins/cache/*/*/*/skills/*/SKILL.md"].flatMap(
    (pattern) => [...new Bun.Glob(pattern).scanSync({ cwd: CONFIG_DIR, followSymlinks: true })],
  );
  const names = [...repositoryFiles, ...installed]
    .map((file) => SKILL_FILE.exec(file)?.[2])
    .filter((name) => name !== undefined);
  return [...new Set(names)].join("\n");
};

const proseChecks: Checks = {
  aiJapanese,
  missingPath: {
    question: noul(
      "Does `document` mention something that looks like a file or directory path in this repository (relative to the repository root or to the document) that is not in `repository_files`? `repository_files` lists only the files whose path shares a segment with the document, so a path whose file is absent from it does not exist. URLs, package names, commands, absolute or home-directory paths, obvious placeholders in examples, and paths the document explicitly says belong to another named repository do not count.",
    ),
    reason:
      "ファイルパスのように書かれているのに、そのファイルがリポジトリにありません。正しいパスに直すか、別のリポジトリのものならどのリポジトリかを書いてください。",
  },
  missingSkill: {
    question: noul(
      "Does `document` refer to a skill by name (such as 「<name> スキル」, `<name>` skill, or `/<name>`) that is not in `available_skills`? Skills the document explicitly says belong to another named repository do not count.",
    ),
    reason:
      "存在しないスキルを参照しています。参照が切れないよう、実在するスキルを指すか、どこのスキルかを書いてください。",
  },
  skillPath: {
    question: noul(
      "Does `document` tell the reader to follow or read another skill by pointing to that skill's SKILL.md or skill directory by path (for example `.claude/skills/<name>` or `skills/<name>/SKILL.md`) where naming the skill (「<name> スキル」) would do? Paths to scripts, checkers, or data files that a command runs or reads do not count.",
    ),
    reason:
      "スキルをファイルパスで指しています。置き場所が変わっても参照が切れないよう、スキル名で指してください。",
  },
  restates: {
    question: noul(
      "Does `document` only restate or paraphrase what other documentation (`other_documents`, official docs, or elsewhere in the same document) already says?",
    ),
    reason:
      "ほかのドキュメントの言い換えになっている箇所があります。書かずに参照先を示してください。",
  },
};

const skillChecks: Checks = {
  frontmatter: {
    question: noul(
      "Does the skill in `document` lack a YAML frontmatter block at the very top (between --- lines) that has both a non-empty `name` and a non-empty `description` saying when to use the skill?",
    ),
    reason:
      "スキルがいつ使われるかを判断できるよう、frontmatter に名前と使う場面を書いてください。",
  },
  reasons: {
    question: noul(
      "Does the skill in `document` explain why a rule exists (background, motivation, rationale) where the rule would be clear without the explanation, instead of only telling the reader what to do?",
    ),
    reason:
      "ルールの理由や背景の説明が長いです。何をすればいいかがすぐ分かるように、短く自然な日本語に書き直してください。",
  },
  filler: {
    question: noul(
      "Does the skill in `document` contain prose that would not change any decision the reader makes, such as introductions, summaries, restatements of the same rule, or generic advice any competent engineer already follows? Concrete references such as library names, file paths, function names, and commands do not count.",
    ),
    reason:
      "読んでもやることが変わらない文（前置き、まとめ、同じことの繰り返し、当たり前の一般論）があります。何をすればいいかが伝わる自然な日本語に書き直してください。ライブラリ名やパス、関数名などの具体的な情報は残してください。",
  },
  details: {
    question: noul(
      "Does the skill in `document` carry details beyond the principles and the steps to follow, such as lists of libraries or options, file paths, function names, config values, lookup tables, or long examples, instead of moving them to files under `references/` in the skill's directory and pointing to those files? The steps themselves, and the command a step runs, do not count.",
    ),
    reason:
      "細かい内容が SKILL.md にあります。考え方と手順がすぐ読み取れるよう、細かい内容は references/ に分けて、そこを指してください。",
  },
};

const docChecks: Checks = {
  derivable: {
    question: noul(
      "Does `document` describe things a reader could learn by reading the code or config, such as the directory or file layout, what each file or function does, function signatures, types, config values, dependency lists, or the list of scripts in package.json? Instructions for users of the project (how to install, how to configure, what it does for them), decisions and conventions that the code cannot show, and pointers to files by path do not count.",
    ),
    reason:
      "コードや設定を見れば分かること（ファイルの構成、各ファイルや関数が何をするか、型、設定値、依存やスクリプトの一覧など）が書かれています。コードと食い違って古くならないよう、コードを見ても分からないこと（なぜそうしたのか、どう使うのか、守る決まり）を書く形に直し、細かいことは該当する場所を指してください。",
  },
  enumerates: {
    question: noul(
      "Does `document` contain a hardcoded list of three or more files, directories, scripts, commands, dependencies, or options that already exist in the repository and could be found there? Such hardcoded lists do not scale: they fall behind as the repository grows. Install steps and a single example do not count.",
    ),
    reason:
      "見れば分かるものを列挙しています。ハードコードした一覧は、ものが増えると追いつかなくなります。一例だけにするか、参照先を示してください。",
  },
};

const hook = defineHook({
  trigger: { PostToolUse: { Write: true, Edit: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { input } = context;
    const path = input.tool_input.file_path;
    if (!PROSE_FILE.test(path) || !existsSync(path)) return context.success();
    const isSkill = basename(path) === "SKILL.md";
    const document = readFileSync(path, "utf8").slice(0, LIMIT);
    const repository = repositoryOf(path) ?? {
      root: dirname(path),
      files: isSkill ? readdirSync(dirname(path), { recursive: true, encoding: "utf8" }) : [],
    };
    const failed = await failedOf(
      {
        file: relative(repository.root, path),
        document,
        written: (input.tool_name === "Write"
          ? input.tool_input.content
          : input.tool_input.new_string
        ).slice(0, LIMIT),
        repository_files: repository.files
          .filter((file) => file.split("/").some((segment) => document.includes(segment)))
          .join("\n")
          .slice(0, LIMIT),
        available_skills: skillsOf(repository.files),
        other_documents: repository.files
          .map((file) => join(repository.root, file))
          .filter((file) => PROSE_FILE.test(file) && file !== path && existsSync(file))
          .map((file) => `# ${relative(repository.root, file)}\n${readFileSync(file, "utf8")}`)
          .join("\n\n")
          .slice(0, LIMIT),
      },
      {
        ...proseChecks,
        ...(isSkill ? skillChecks : {}),
        ...(DOCS.has(basename(path)) ? docChecks : {}),
      },
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(`${path} を直してください。\n${failed.join("\n")}`);
  },
});

await runHook(hook);
