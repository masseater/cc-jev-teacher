import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey, isScratch } from "./hook.ts";
import { repositoryOf } from "./repository.ts";

const SCRIPT_FILE =
  /(^|\/)(package\.json|vite\.config\.[cm]?[jt]s|Makefile|justfile|mise\.toml|turbo\.json|Taskfile\.ya?ml|\.github\/workflows\/[^/]+\.ya?ml)$/;
const LIMIT = 12000;

const hook = defineHook({
  trigger: { PostToolUse: { Write: true, Edit: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const path = context.input.tool_input.file_path;
    const repository = repositoryOf(path);
    if (!SCRIPT_FILE.test(path) || !existsSync(path) || isScratch(path) || !repository)
      return context.success();
    const failed = await failedOf(
      {
        files: repository.files
          .filter((file) => SCRIPT_FILE.test(file) && !file.includes("node_modules/"))
          .map((file) => join(repository.root, file))
          .filter((file) => existsSync(file))
          .map((file) => `# ${relative(repository.root, file)}\n${readFileSync(file, "utf8")}`)
          .join("\n\n")
          .slice(0, LIMIT),
      },
      {
        duplicated: {
          question: noul(
            "Across `files`, are several scripts, tasks, or CI steps defined that do the same kind of job (for example `vp check` and a separate `vp run check:skills`, both checks), where one entry point that runs them all would do?",
          ),
          reason: "同じ意味を持つスクリプトが複数定義されています。1つにまとめてください。",
        },
        hardcoded: {
          question: noul(
            "Does a script, task, or CI step in `files` name specific files, directories, or packages one by one (for example each skill directory), so it must be edited whenever one is added, where a glob, `git ls-files`, or a config file would scale?",
          ),
          reason:
            "対象のファイルやディレクトリを1つずつハードコードしていて、増えたときに追いつきません。増えても書き足さずに済むよう、対象がまとめて決まる形にしてください。",
        },
      },
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(`${path} を直してください。\n${failed.join("\n")}`);
  },
});

await runHook(hook);
