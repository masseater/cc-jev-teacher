# cc-jev-teacher

**Two Claude Code plugins: one sends Claude back to work until the job is actually done, the other keeps its context small.**

[![CI](https://github.com/masseater/cc-jev-teacher/actions/workflows/ci.yml/badge.svg)](https://github.com/masseater/cc-jev-teacher/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://code.claude.com/docs/en/plugins)

## Why

When you hand Claude a task and walk away, it often stops early: it reports "done, but not deployed", it edits code with `sed -i`, it switches a lint rule off to make the error go away, or it writes three paragraphs of "how I did it" instead of saying what changed. You only find out when you read the report, and then you have to instruct it again.

cc-jev-teacher puts a teacher between Claude and you. A decision model on [OpenRouter](https://openrouter.ai) grades each risky tool call and every final report, and when the answer is bad, the hook blocks and tells Claude exactly what to fix. Claude fixes it before you ever see the report.

cc-jev-pruner uses the same decision model to keep Claude's context small: it compacts without a summary, trims long Bash output, and finds code by behavior with Jevgrep.

This repository is a marketplace with both plugins, under `plugins/`. Each installs and runs on its own.

| Plugin           | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `cc-jev-teacher` | Hooks that judge tool calls, documents and reports, and block  |
| `cc-jev-pruner`  | Compaction, Bash output trimming, and the `jevgrep` MCP server |

## Install

```sh
claude plugin marketplace add masseater/cc-jev-teacher
claude plugin install cc-jev-teacher@cc-jev-teacher --config openrouter_api_key=YOUR_OPENROUTER_API_KEY
claude plugin install cc-jev-pruner@cc-jev-teacher --config openrouter_api_key=YOUR_OPENROUTER_API_KEY
```

Install either one alone if you want only its part. Each plugin keeps its own key and model.

It uses the free [Respan Span-01 Lite](https://openrouter.ai/respan/span-01-lite) model by default.

Start a new Claude Code session. That's it.

From inside Claude Code, `/plugin marketplace add masseater/cc-jev-teacher` followed by `/plugin` works too; Claude Code prompts for the key.

## Demo

Ask Claude to edit a file with a script, and the `script-edit` hook stops it:

```text
⏺ Bash(sed -i "" "s/1/2/" app.ts)
  ⎿  PreToolUse:Bash hook error: [bun ".../cc-jev-teacher/src/script-edit.ts"]:
     - 数ファイル程度の編集にスクリプトを使っています。変更が見えて確かめられるよう、ファイルを直接編集してください。
```

End a turn with an unfinished, hedged, English report, and the `stop-report-check` hook sends it back:

```text
Stop hook feedback:
- 完了報告に、指示のうち未対応・先送り・未検証の項目が残っています。…今この場で対応・検証してから報告し直してください。
- 推測や曖昧な量（おそらく・〜のはず・多い・速い など）で書いています。…
- 応答の地の文が英語になっています。日本語で書き直してください。…
```

## What It Does

### cc-jev-teacher

The hooks check Claude's tool calls, the documents it writes, and its reports, and block with feedback when one falls short, such as editing a file with `sed -i` or naming a domain concept `BookingDataProcessor`. Naming is judged against the project's glossary (`CONTEXT.md` and similar) when there is one. A decision model on OpenRouter makes every judgment; the questions live under `plugins/cc-jev-teacher/src/`, and the feedback points Claude to the skills under `plugins/cc-jev-teacher/skills/`.

### cc-jev-pruner

Two hooks keep Claude's context small, through the same decision model.

When Claude Code compacts the conversation, or after a turn that leaves context use at 60% or more, the model scores each earlier tool call and its result for whether the task still needs them. Calls it no longer needs are dropped, and stale results are cut to a short head, so the conversation is kept as it was written instead of being replaced by a summary. If the request fails or saves less than a quarter, Claude Code's own summary runs instead.

When a Bash command prints more than about 10,000 tokens, the model scores the output in chunks against the recent instructions, and only the chunks that matter reach Claude, followed by the path of the full output saved under `.claude/fast-jev-output/`. Output that looks like it holds credentials is passed through untouched and never sent.

The pruner also brings [Jevgrep](https://github.com/dzhng/jevgrep) as an MCP server, `jevgrep`, so Claude can ask where a behavior lives instead of searching text. Its `search` tool takes a natural-language question and an optional root, walks the repository, lets the same decision model judge which folders, files, and declarations matter, and returns the relevant files with verbatim source excerpts and reading leads. Its `files` tool counts what a search under a root may read without sending anything. The `jevgrep` skill tells Claude when to use them. Answers are cached under `~/.cache/jevgrep`.

### Both

Every hook, and every Jevgrep search, appends one line per run to `.claude/cc-jev-teacher/requests.jsonl` in the project, with the hook, the model, the number of requests, and an estimate of the tokens sent, so the cost of each hook can be measured. Each request names `cc-jev-teacher` as its app and `<place>:<project>:<hook>` as its user (`place` is `ci`, `cloud` for Claude Code on the web, or `local`), with the Claude Code session as its session, so OpenRouter's activity page splits the spend by where it ran.

The pruner's compaction and Bash output hooks run as Claude Code hooks modules, so they need `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in the environment or in the `env` of `settings.json`. They read the key and model from the pruner's options or the environment.

## Credits

- Compaction (`plugins/cc-jev-pruner/src/compaction`) is [tamaratran/fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) as of [`e3f262a`](https://github.com/tamaratran/fast-jev-compaction/tree/e3f262a7f4d42bd8dd32ced30d26176f7cb545b0), MIT. Its license is in [`src/compaction/LICENSE`](plugins/cc-jev-pruner/src/compaction/LICENSE). The teacher carries a copy of its `state.ts` and `types.ts` to fit a session into one request.
- Code search (`plugins/cc-jev-pruner/src/grep`, the `jevgrep` MCP server, and the `jevgrep` skill) is [dzhng/jevgrep](https://github.com/dzhng/jevgrep) as of [`703aba1`](https://github.com/dzhng/jevgrep/tree/703aba1a36a3b854be405244ea748f607cd630c0), MIT. Its license is in [`src/grep/LICENSE`](plugins/cc-jev-pruner/src/grep/LICENSE).
- Bash output trimming (`plugins/cc-jev-pruner/src/bash-output`) is [tamaratran/jev-pruner](https://github.com/tamaratran/jev-pruner) as of [`edbc602`](https://github.com/tamaratran/jev-pruner/tree/edbc60262a5edc07e18d646c1a3f8a9f0ae868c5), MIT. Its license is in [`src/bash-output/LICENSE`](plugins/cc-jev-pruner/src/bash-output/LICENSE).

The pruner sends their requests through its own OpenRouter backend, Jevgrep's searches use the plugin's key instead of `jg auth`, and the Bash output hook skips credential-like output instead of sending it unsaved.

The `dead-cliche-writing` skill comes from [BoxPistols/ux-writing-dead-cliche](https://github.com/BoxPistols/ux-writing-dead-cliche) (MIT) and runs its checker from the npm package `textlint-rule-ux-writing-dead-cliche`.

## How the Teacher Grades

1. **Filter** — the hook skips scratch paths and harmless commands locally.
2. **Grade** — the hook sends the instruction, the tool call or report, and a few yes/no questions to the decision model in one request.
3. **Block or pass** — a failing grade exits with code 2 and the reason goes back to Claude; anything else, including API errors, lets Claude continue.

## Compatibility

- Claude Code with plugin support
- macOS and Linux
- [Bun](https://bun.sh) on `PATH` (hooks run as TypeScript on Bun, and Claude Code installs the plugin's dependencies with `bun install`)
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` for the pruner's compaction and Bash output hooks

## Configuration

Both plugins take the same options, set for each plugin.

| Option               | Required | Description                                                                                                                                                             |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openrouter_api_key` | Yes      | Your OpenRouter API key, passed to hooks as `CLAUDE_PLUGIN_OPTION_OPENROUTER_API_KEY`. `OPENROUTER_API_KEY` in the environment also works.                              |
| `openrouter_model`   | No       | The OpenRouter decision model. Defaults to `respan/span-01-lite`; `respan/span-01` and `typesafe/jev-1.13` also work. `OPENROUTER_MODEL` in the environment also works. |

Sensitive options are stored in the OS credential store. Without a key every hook does nothing, and Jevgrep searches fail.

Requests are routed only to providers that do not collect user data (`provider.data_collection: "deny"`). Set `CC_JEV_TEACHER_ALLOW_TRAINING=1` to allow providers that may store and train on your prompts.

The feedback messages are in Japanese and encode the author's working rules (for example, no `localhost` URLs because the author works over SSH). Fork the repository to change them.

## Development

Each plugin directory has its own `package.json` and `bun.lock`, which Claude Code installs from. The root `package.json` holds the same dependencies plus the tooling, so `bun install` at the root is enough to run `vp run check`.

The teacher keeps copies of the pruner's `src/backend.ts`, `src/request-log.ts`, `src/compaction/state.ts` and `src/compaction/types.ts`, because an installed plugin reads only its own directory. Edit the pruner's files and run `bun scripts/sync-shared.ts`; the check fails while a copy differs.

## License

MIT © 2026 masseater
