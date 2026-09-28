import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";
import { collectToolCalls, fitState } from "fast-jev-compaction";

import { type Checks, failedOf, hasApiKey } from "./hook.ts";
import { messagesOf } from "./transcript.ts";

const CHANGING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"]);
const RECENT = 6;

const checks: Checks = {
  localPatch: {
    question: noul(
      "Looking at every change the assistant made to code, config, or documents in this session, did it pile up local patches (special cases, extra branches, flags, options, wrappers, retries, duplicated logic, or more and more text) where simplifying the whole would have been better, such as removing code or rules that became unnecessary, merging duplicates, or restructuring so the result is smaller overall, and has that simplification still not been done by the end of the session? Sessions that changed nothing do not count.",
    ),
    reason:
      "変更が局所的な継ぎ足し（特別扱い、分岐、フラグ、ラッパー、重複など）になっています。全体を小さく保てるよう、セッション全体の変更を見直して、全体をシンプルにしてください。",
  },
  unverifiedVersion: {
    question: noul(
      "Did the assistant add or update a dependency in a manifest or lockfile (package.json, bun.lock, pnpm-lock.yaml, requirements.txt, pyproject.toml, Cargo.toml, go.mod, Gemfile, and so on) without, somewhere in this session, checking the library's latest version from a live source (a registry query such as `npm view <name> version`, the release page, or a web search) and using that version? Installing with a command that resolves the latest version itself (such as `bun add <name>` without a version) counts as checked.",
    ),
    reason:
      "依存を追加・更新したのに、そのライブラリが最新かを調べていません。古い版を持ち込まないよう、最新版を確かめてから入れてください。",
  },
};

const hook = defineHook({
  trigger: { Stop: true },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { input } = context;
    if (input.stop_hook_active) return context.success();
    const messages = messagesOf(input.transcript_path);
    if (!messages.some((message) => message.toolUses.some((use) => CHANGING_TOOLS.has(use.tool))))
      return context.success();
    const { history } = fitState(messages, collectToolCalls(messages, RECENT), {
      maxStateTokens: 25_000,
      preserveRecentMessages: RECENT,
      goal: "",
    }).state;
    const failed = await failedOf(
      {
        context:
          "`history` is a whole coding-assistant session, oldest first. Tool outputs are replaced by a short note and long texts may be abridged.",
        history: JSON.stringify(history),
      },
      checks,
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(`セッション全体を見直してください。\n${failed.join("\n")}`);
  },
});

await runHook(hook);
