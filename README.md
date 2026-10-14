# cc-jev-teacher

**Two Claude Code plugins: one sends Claude back to work until the job is actually done, the other keeps its context small.**

[![CI](https://github.com/masseater/cc-jev-teacher/actions/workflows/ci.yml/badge.svg)](https://github.com/masseater/cc-jev-teacher/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://code.claude.com/docs/en/plugins)

When you hand Claude a task and walk away, it often stops early: it reports "done, but not deployed", edits code with `sed -i`, switches a lint rule off to make an error go away, or writes three paragraphs of "how I did it" instead of saying what changed. You only find out when you read the report.

- `cc-jev-teacher` has a decision model on [OpenRouter](https://openrouter.ai) grade Claude's risky tool calls, the documents it writes, and every final report. When one falls short, the hook blocks and tells Claude what to fix, so Claude fixes it before you see the report.
- `cc-jev-pruner` uses the same model to keep Claude's context small. It compacts by dropping tool calls the task no longer needs instead of writing a summary, trims long Bash output to the parts that matter, and adds a `jevgrep` MCP server that finds the code behind a behavior from a plain-language question.

Each plugin installs and runs on its own.

## Requirements

- Claude Code on macOS or Linux
- [Bun](https://bun.sh) on `PATH`. The hooks run on Bun
- An [OpenRouter](https://openrouter.ai) API key. The default model, [Respan Span-01 Lite](https://openrouter.ai/respan/span-01-lite), is free
- For the pruner's compaction and Bash output trimming, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in your environment or in the `env` of `settings.json`

## Install

```sh
claude plugin marketplace add masseater/cc-jev-teacher
claude plugin install cc-jev-teacher@cc-jev-teacher --config openrouter_api_key=YOUR_OPENROUTER_API_KEY
claude plugin install cc-jev-pruner@cc-jev-teacher --config openrouter_api_key=YOUR_OPENROUTER_API_KEY
```

Install only one of them if you want only its part. Inside Claude Code, `/plugin marketplace add masseater/cc-jev-teacher` followed by `/plugin` works too, and Claude Code asks for the key.

Start a new Claude Code session, then ask Claude to edit a file with a script. The teacher's `script-edit` hook stops it:

```text
⏺ Bash(sed -i "" "s/1/2/" app.ts)
  ⎿  PreToolUse:Bash hook error: [bun ".../cc-jev-teacher/src/script-edit.ts"]:
     - 数ファイル程度の編集にスクリプトを使っています。変更が見えて確かめられるよう、ファイルを直接編集してください。
```

An unfinished, hedged, or English report at the end of a turn is sent back the same way:

```text
Stop hook feedback:
- 完了報告に、指示のうち未対応・先送り・未検証の項目が残っています。…今この場で対応・検証してから報告し直してください。
- 推測や曖昧な量（おそらく・〜のはず・多い・速い など）で書いています。…
- 応答の地の文が英語になっています。日本語で書き直してください。…
```

The feedback is in Japanese and follows the author's working rules (for example, no `localhost` URLs because the author works over SSH). Fork the repository to change them.

## Configuration

Both plugins take the same options, set separately for each plugin.

| Option               | Required | Description                                                                                                                                                  |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `openrouter_api_key` | Yes      | Your OpenRouter API key. `OPENROUTER_API_KEY` in the environment also works. Without a key, every hook does nothing.                                         |
| `openrouter_model`   | No       | The decision model. Defaults to `respan/span-01-lite`; `respan/span-01` and `typesafe/jev-1.13` also work. `OPENROUTER_MODEL` in the environment also works. |

Requests go only to OpenRouter providers that do not collect user data. Set `CC_JEV_TEACHER_ALLOW_TRAINING=1` to allow providers that may store and train on your prompts. Bash output that looks like it holds credentials is never sent.

To see what each hook costs, read `.claude/cc-jev-teacher/requests.jsonl` in your project: every run appends one line with the hook, the model, the number of requests, and the estimated tokens sent.

## Credits

The pruner is built on these MIT-licensed projects. Their licenses are kept next to the code.

- Compaction: [tamaratran/fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) at [`e3f262a`](https://github.com/tamaratran/fast-jev-compaction/tree/e3f262a7f4d42bd8dd32ced30d26176f7cb545b0) ([license](plugins/cc-jev-pruner/src/compaction/LICENSE))
- Code search: [dzhng/jevgrep](https://github.com/dzhng/jevgrep) at [`703aba1`](https://github.com/dzhng/jevgrep/tree/703aba1a36a3b854be405244ea748f607cd630c0) ([license](plugins/cc-jev-pruner/src/grep/LICENSE))
- Bash output trimming: [tamaratran/jev-pruner](https://github.com/tamaratran/jev-pruner) at [`edbc602`](https://github.com/tamaratran/jev-pruner/tree/edbc60262a5edc07e18d646c1a3f8a9f0ae868c5) ([license](plugins/cc-jev-pruner/src/bash-output/LICENSE))

The teacher's `dead-cliche-writing` skill comes from [BoxPistols/ux-writing-dead-cliche](https://github.com/BoxPistols/ux-writing-dead-cliche) (MIT).

## License

MIT © 2026 masseater
