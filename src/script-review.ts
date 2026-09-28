import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey } from "./jev-checks.ts";
import { isScratch } from "./scratch-path.ts";
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
            "Do two or more scripts or tasks in `files` run the same tool over the same targets, differing only in options, so that keeping more than one is redundant? Entries that run at a different time or on a different subset of files, such as a hook over staged files or a CI step, are not duplicates.",
          ),
          reason: "同じ意味を持つスクリプトが複数定義されています。1つにまとめてください。",
        },
        hardcoded: {
          question: noul(
            "Does a script, task, or CI step in `files` hand its target files or directories to a tool by listing each one by name, so that a new file of the same kind would be skipped until someone edits the script?",
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
