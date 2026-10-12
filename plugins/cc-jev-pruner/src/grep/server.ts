// Jevgrep as this plugin's MCP server: Claude asks how a behavior works, and the server returns
// the files and source excerpts Jev judged relevant. Plugin MCP servers receive the plugin's
// options in the environment, so the searches use the same OpenRouter key as the hooks.
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { processBackend } from "../backend.ts";
import { count, REQUEST_LOG, REQUEST_LOG_IGNORE, requestLine, tally } from "../request-log.ts";
import { createEvaluationCache } from "./cache.ts";
import { createEvaluator } from "./evaluator.ts";
import { inventory } from "./inventory.ts";
import { retrieve } from "./retrieve.ts";
import { renderInventory, renderResult } from "./render.ts";
import { storageDirectory } from "./storage.ts";
import type { SearchInput } from "./types.ts";

const HOOK = "jevgrep";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const backend = () =>
  processBackend(process.env, { project: basename(projectDir), hook: HOOK, sessionId: "" });

const policyShape = {
  exclude: z
    .array(z.string())
    .optional()
    .describe("gitignore patterns relative to the root, for paths the search must skip"),
  hidden: z.boolean().optional().describe("Include hidden paths"),
  noIgnore: z.boolean().optional().describe("Disable .gitignore and .ignore patterns"),
  includeDependencies: z.boolean().optional().describe("Include dependency and build directories"),
};

type PolicyArgs = {
  exclude?: string[] | undefined;
  hidden?: boolean | undefined;
  noIgnore?: boolean | undefined;
  includeDependencies?: boolean | undefined;
};

const policyOf = (args: PolicyArgs): NonNullable<SearchInput["policy"]> => {
  const policy: NonNullable<SearchInput["policy"]> = {};
  if (args.hidden) policy.hidden = true;
  if (args.noIgnore) policy.noIgnore = true;
  if (args.includeDependencies) policy.includeDependencies = true;
  const exclude = (args.exclude ?? []).filter((pattern) => pattern.trim());
  if (exclude.length) policy.exclude = [...new Set(exclude)].sort();
  return policy;
};

const text = (value: string, isError = false) => ({
  content: [{ type: "text" as const, text: value }],
  ...(isError ? { isError } : {}),
});

const rootOf = async (root: string | undefined) => {
  const path = resolve(projectDir, root ?? ".");
  return (await stat(path).catch(() => undefined))?.isDirectory() ? path : undefined;
};

const logRequests = (model: string, sent: ReturnType<typeof tally>) => {
  try {
    mkdirSync(join(projectDir, REQUEST_LOG, ".."), { recursive: true });
    const ignore = join(projectDir, REQUEST_LOG_IGNORE);
    if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
    appendFileSync(join(projectDir, REQUEST_LOG), requestLine(HOOK, model, sent));
  } catch {
    return;
  }
};

const server = new McpServer({ name: "jevgrep", version: "1.0.0" });

server.registerTool(
  "search",
  {
    description:
      "Find the code behind a behavior by asking about it in natural language. Returns a summary, the relevant files, verbatim source excerpts and reading leads. Use for how, why or where questions about a repository; use grep or file search for exact symbols, strings or filenames.",
    inputSchema: {
      query: z.string().min(1).describe("The behavior to find, as a natural-language question"),
      root: z
        .string()
        .optional()
        .describe("Directory to search, relative to the project. Defaults to the project root"),
      ...policyShape,
    },
  },
  async (args, extra) => {
    const root = await rootOf(args.root);
    if (!root) return text("The root must be an existing directory.", true);
    const jev = backend();
    if (!jev.apiKey)
      return text(
        "No OpenRouter API key. Set the plugin's openrouter_api_key option or OPENROUTER_API_KEY.",
        true,
      );
    const policy = policyOf(args);
    const sent = tally();
    const evaluator = createEvaluator({
      backend: jev,
      cache: createEvaluationCache({ directory: storageDirectory("cache") }),
      policyVersion: JSON.stringify(policy),
      requestLimit: 1_000,
      signal: extra.signal,
      onRequest: (body) => count(sent, body),
    });
    try {
      const result = await retrieve(
        { root, query: args.query, policy, signal: extra.signal },
        evaluator,
      );
      return text(renderResult(result));
    } catch (error) {
      return text(error instanceof Error ? error.message : "Search failed.", true);
    } finally {
      if (sent.requests) logRequests(jev.model, sent);
    }
  },
);

server.registerTool(
  "files",
  {
    description:
      "Count the files a search under a root may read, grouped by top-level directory. Sends nothing to the decision model. Use it before searching a large or unfamiliar root.",
    inputSchema: {
      root: z
        .string()
        .optional()
        .describe("Directory to count, relative to the project. Defaults to the project root"),
      ...policyShape,
    },
  },
  async (args, extra) => {
    const root = await rootOf(args.root);
    if (!root) return text("The root must be an existing directory.", true);
    const result = await inventory({ root, policy: policyOf(args), signal: extra.signal });
    return text(renderInventory(result));
  },
);

await server.connect(new StdioServerTransport());
