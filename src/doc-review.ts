import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { clientOf, hasApiKey, THRESHOLD } from "./hook.ts";

const DOCS = new Set(["README.md", "AGENTS.md", "CLAUDE.md"]);
const LIMIT = 12000;

const filesOf = (directory: string) => {
  try {
    return execFileSync("git", ["ls-files"], { cwd: directory, encoding: "utf8" }).slice(0, LIMIT);
  } catch {
    return "(not a git repository)";
  }
};

const hook = defineHook({
  trigger: { PostToolUse: { Write: true, Edit: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const path = context.input.tool_input.file_path;
    if (!DOCS.has(basename(path)) || !existsSync(path)) return context.success();
    const { answers } = await clientOf().systemOne({
      state: {
        file: basename(path),
        document: readFileSync(path, "utf8").slice(0, LIMIT),
        repository_files: filesOf(dirname(path)),
      },
      questions: {
        derivable: noul(
          "Does the document describe things a reader could learn by reading the code or config, such as the directory or file layout, what each file or function does, function signatures, types, config values, dependency lists, or the list of scripts in package.json? Instructions for users of the project (how to install, how to configure, what it does for them), decisions and conventions that the code cannot show, and pointers to files by path do not count.",
        ),
      },
    });
    if (answers.derivable.noul < THRESHOLD) return context.success();
    return context.blockingError(
      `${path} に、コードや設定を見れば分かること（ファイルの構成、各ファイルや関数が何をするか、型、設定値、依存やスクリプトの一覧など）が書かれています。そこは、コードを見ても分からないこと（なぜそうしたのか、どう使うのか、守る決まり）を書く形に直し、細かいことは該当するファイルのパスで示してください。`,
    );
  },
});

await runHook(hook);
