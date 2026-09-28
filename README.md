# Follow Through

A Claude Code plugin that makes Claude finish the job.

Each hook asks [TypeSafe](https://typesafe.ai) a few yes/no questions about the tool call or the final report. When the answer is bad, the hook blocks and tells Claude what to fix, so you get a finished, verified result instead of a report you have to read and re-instruct.

| Hook | Event | Sends Claude back when |
| --- | --- | --- |
| `script-edit` | PreToolUse `Bash` | it edits source files with `sed -i`, heredocs, or scripts instead of Edit / Write |
| `existing-solution` | PreToolUse `Write` | it starts building something new without first searching for an existing library, CLI, service, or skill |
| `config-relax` | PreToolUse `Write` / `Edit` | it disables or loosens a setting, lint rule, check, or limit that you did not ask to loosen |
| `stop-report-check` | Stop | the final report leaves work unfinished or unverified, leaves test data behind, fixes only the symptom, has no recurrence prevention, guesses numbers instead of measuring, asks permission for things it can do itself, cites external facts without looking them up, or is verbose |

The feedback messages are in Japanese and follow the author's conventions (for example, reports in Japanese, no `localhost` URLs because the user works over SSH). Fork the repository if yours differ.

## Requirements

- Node.js 20 or later on `PATH`
- A TypeSafe API key

## Install

```sh
claude plugin marketplace add masseater/claude-code-follow-through
claude plugin install follow-through@follow-through --config typesafe_api_key=<your TypeSafe API key>
```

Or run `/plugin marketplace add masseater/claude-code-follow-through` inside Claude Code and install `follow-through` from `/plugin`; Claude Code prompts for the key.

The key is stored in the OS credential store and passed to the hooks as `CLAUDE_PLUGIN_OPTION_TYPESAFE_API_KEY`. `TYPESAFE_API_KEY` in the environment also works. Without a key every hook does nothing.

## Develop

```sh
pnpm install
pnpm typecheck
pnpm build   # regenerates dist/, which is committed because plugins are installed without npm install
claude --plugin-dir .
```

Bump `version` in `.claude-plugin/plugin.json` when releasing; installed copies update only when it changes.
