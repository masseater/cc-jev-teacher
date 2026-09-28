# cc-jev-teacher

**A Claude Code plugin that sends Claude back to work until the job is actually done.**

[![CI](https://github.com/masseater/cc-jev-teacher/actions/workflows/ci.yml/badge.svg)](https://github.com/masseater/cc-jev-teacher/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](https://code.claude.com/docs/en/plugins)

## Why

When you hand Claude a task and walk away, it often stops early: it reports "done, but not deployed", it edits code with `sed -i`, it switches a lint rule off to make the error go away, or it writes three paragraphs of "how I did it" instead of saying what changed. You only find out when you read the report, and then you have to instruct it again.

cc-jev-teacher puts a teacher between Claude and you. [TypeSafe Jev](https://typesafe.ai) grades each risky tool call and every final report, and when the answer is bad, the hook blocks and tells Claude exactly what to fix. Claude fixes it before you ever see the report.

## Install

```sh
claude plugin marketplace add masseater/cc-jev-teacher
claude plugin install cc-jev-teacher@cc-jev-teacher --config typesafe_api_key=YOUR_TYPESAFE_API_KEY
```

Start a new Claude Code session. That's it.

From inside Claude Code, `/plugin marketplace add masseater/cc-jev-teacher` followed by `/plugin` works too; Claude Code prompts for the key.

## Demo

Ask Claude to edit a file with a script, and the `script-edit` hook stops it:

```text
⏺ Bash(sed -i "" "s/1/2/" app.ts)
  ⎿  PreToolUse:Bash hook error: [bun ".../cc-jev-teacher/src/script-edit.ts"]:
     数ファイル程度の編集にスクリプトを使っています。Edit / Write ツールで直接編集してください。
```

End a turn with an unfinished, hedged, English report, and the `stop-report-check` hook sends it back:

```text
Stop hook feedback:
- 完了報告に、指示のうち未対応・先送り・未検証の項目が残っています。…今この場で対応・検証してから報告し直してください。
- 推測や曖昧な量（おそらく・〜のはず・多い・速い など）で書いています。…
- 応答の地の文が英語になっています。日本語で書き直してください。…
```

## What It Does

The hooks check Claude's tool calls, the documents it writes, and its reports, and block with feedback when one falls short, such as editing a file with `sed -i`. TypeSafe Jev makes every judgment; the questions live under `src/`, and the feedback points Claude to the skills under `skills/`.

The `dead-cliche-writing` skill comes from [BoxPistols/ux-writing-dead-cliche](https://github.com/BoxPistols/ux-writing-dead-cliche) (MIT) and runs its checker from the npm package `textlint-rule-ux-writing-dead-cliche`.

## Workflow

1. **Filter** — the hook skips scratch paths and harmless commands locally.
2. **Grade** — the hook sends the instruction, the tool call or report, and a few yes/no questions to TypeSafe Jev in one request.
3. **Block or pass** — a failing grade exits with code 2 and the reason goes back to Claude; anything else, including API errors, lets Claude continue.

## Compatibility

- Claude Code with plugin support
- macOS and Linux
- [Bun](https://bun.sh) on `PATH` (hooks run as TypeScript on Bun, and Claude Code installs the plugin's dependencies with `bun install`)

## Configuration

| Option             | Required | Description                                                                                                                                                                |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typesafe_api_key` | Yes      | Your TypeSafe API key. Stored in the OS credential store and passed to hooks as `CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY`. `TYPESAFE_API_KEY` in the environment also works. |

Without a key every hook does nothing.

The feedback messages are in Japanese and encode the author's working rules (for example, no `localhost` URLs because the author works over SSH). Fork the repository to change them.

## License

MIT © 2026 masseater
