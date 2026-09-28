import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { failedOf, hasApiKey, isScratch } from "./hook.ts";
import { repositoryOf } from "./repository.ts";

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|cs|php|scala)$/;
const GLOSSARY_FILE =
  /(^|\/)(CONTEXT|CONTEXT-MAP|UBIQUITOUS_LANGUAGE|GLOSSARY)\.md$|(^|\/)glossary[^/]*\.md$/i;
const PURPOSE_FILE = /^(README|AGENTS|CLAUDE)\.md$/i;
const LIMIT = 12000;

const hook = defineHook({
  trigger: { PostToolUse: { Write: true, Edit: true } },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { input } = context;
    const path = input.tool_input.file_path;
    const repository = repositoryOf(path);
    if (!CODE_FILE.test(path) || !existsSync(path) || isScratch(path) || !repository)
      return context.success();
    const file = relative(repository.root, path);
    const read = (pattern: RegExp, limit: number) =>
      repository.files
        .filter((other) => pattern.test(other) && existsSync(join(repository.root, other)))
        .map((other) => `# ${other}\n${readFileSync(join(repository.root, other), "utf8")}`)
        .join("\n\n")
        .slice(0, limit);
    const failed = await failedOf(
      {
        file,
        code: readFileSync(path, "utf8").slice(0, LIMIT),
        written: (input.tool_name === "Write"
          ? input.tool_input.content
          : input.tool_input.new_string
        ).slice(0, LIMIT),
        glossary: read(GLOSSARY_FILE, LIMIT),
        purpose: read(PURPOSE_FILE, 2000),
        neighbors: repository.files
          .filter((other) => dirname(other) === dirname(file))
          .join("\n")
          .slice(0, 2000),
      },
      {
        mechanismName: {
          question: noul(
            "Does `written` name a domain concept of the project (see `purpose` and `glossary`) by what the code does to it, such as a name built from Processor, Handler, Manager, Data, Info, or handle/process/do, instead of by what the concept is called in the domain? Also count names that use a different word for a concept `glossary` already names. Code whose subject is the mechanism itself (HTTP, database, CLI, file system, framework glue, generic utilities), and names that `written` only uses without defining, do not count.",
          ),
          reason:
            "業務の概念を、コードが何をするかで名付けています。業務の話とコードを突き合わせられるよう、その概念が業務で何と呼ばれるかで名付けてください。",
        },
        complexValidation: {
          question: noul(
            "Does `written` check the shape or values of data (input, JSON, config, API responses, tool input) with complex hand-written conditions, such as chains of typeof / instanceof / in checks, several && or || clauses over fields, or nested null and range checks, where a validation library schema would express the same rules simply? A single simple check does not count.",
          ),
          reason:
            "複雑な条件式でデータを検証しています。何を受け付けるかが一目で分かるよう、バリデーションライブラリを使って簡潔に検証してください。",
        },
      },
    );
    if (failed.length === 0) return context.success();
    return context.blockingError(`${path} を直してください。\n${failed.join("\n")}`);
  },
});

await runHook(hook);
