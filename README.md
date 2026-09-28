# jev

Claude Code hooks that ask [TypeSafe](https://typesafe.ai) yes/no questions about each tool call and final report, and send Claude back to work when the answer is bad.

The messages and rules enforce one person's AGENTS.md conventions (Japanese reports, fish helpers such as `cf-token`, no localhost URLs, and so on). Fork it if yours differ.

| Hook | Event | Blocks when |
| --- | --- | --- |
| `script-edit` | PreToolUse `Bash` | source files are edited with `sed -i`, heredocs, or scripts instead of Edit / Write |
| `existing-solution` | PreToolUse `Write` | a new file is created for a build request before any search for existing solutions |
| `config-relax` | PreToolUse `Write\|Edit` | a setting, rule, check, or limit is loosened without being asked |
| `stop-report-check` | Stop | the final report leaves work unfinished, is verbose, unmeasured, in English, etc. |

## Install

```sh
claude plugin marketplace add masseater/jev
claude plugin install jev@jev --config typesafe_api_key=<your TypeSafe API key>
```

The key is stored in the OS credential store. Without a key every hook is a no-op.

## Develop

```sh
pnpm install
pnpm typecheck
pnpm build   # regenerate dist/, which is committed because plugins are installed without npm install
claude --plugin-dir .
```
