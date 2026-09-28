import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";

import type { Message } from "fast-jev-compaction";

type Entry = {
  type?: string;
  isMeta?: boolean;
  message?: { role?: string; content?: unknown };
  attachment?: { type?: string; prompt?: unknown; humanTurn?: boolean };
};

type ToolUse = {
  type?: string;
  name?: string;
  input?: {
    file_path?: string;
    content?: string;
    new_string?: string;
    command?: string;
    skill?: string;
  };
};

const SEARCH_TOOLS = /exa|websearch|webfetch|web_search|web_fetch|firecrawl|context7|jev_navigate/i;
const SEARCH_SKILLS = /dont-it-yourself|find-skills|firecrawl|deep-research/;
const SEARCH_COMMANDS =
  /\b(gh (api|search|repo view)|skills (find|add)|npm (view|search|info)|vp (info|view)|pnpm (view|info)|curl\s[^|]*https?:\/\/|jg )/;

const textOf = (content: unknown) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter(
            (part): part is { type: "text"; text: string } =>
              typeof part === "object" && part !== null && part.type === "text",
          )
          .map((part) => part.text)
          .join("\n")
      : "";

const promptOf = (entry: Entry) => {
  if (entry.type !== "user" || entry.isMeta || entry.message?.role !== "user") return null;
  const text = textOf(entry.message.content).trim();
  return text && !text.startsWith("<") && !text.startsWith("Stop hook feedback") ? text : null;
};

const CHUNK = 1 << 20;
const NEWLINE = 0x0a;

// Entries of the current turn: from the last human prompt to the end, read backwards in chunks.
export const entriesOf = (transcriptPath: string) => {
  const fd = openSync(transcriptPath, "r");
  try {
    const entries: Array<Entry> = [];
    let end = fstatSync(fd).size;
    let rest = Buffer.alloc(0);
    while (end > 0) {
      const start = Math.max(0, end - CHUNK);
      const chunk = Buffer.alloc(end - start);
      readSync(fd, chunk, 0, chunk.length, start);
      end = start;
      const data = Buffer.concat([chunk, rest]);
      const cut = start === 0 ? -1 : data.indexOf(NEWLINE);
      if (start > 0 && cut === -1) {
        rest = data;
        continue;
      }
      rest = data.subarray(0, cut + 1);
      const lines = data
        .subarray(cut + 1)
        .toString("utf8")
        .split("\n")
        .reverse();
      for (const line of lines) {
        if (!line) continue;
        const entry = JSON.parse(line) as Entry;
        entries.push(entry);
        if (promptOf(entry) !== null) return entries.reverse();
      }
    }
    return entries.reverse();
  } finally {
    closeSync(fd);
  }
};

export const instructionOf = (entries: Array<Entry>) =>
  entries
    .reduce<Array<string>>((turn, entry) => {
      const text = promptOf(entry);
      if (text) return [text];
      const queued = entry.attachment;
      return entry.type === "attachment" &&
        queued?.type === "queued_command" &&
        queued.humanTurn &&
        typeof queued.prompt === "string"
        ? [...turn, queued.prompt.trim()]
        : turn;
    }, [])
    .join("\n\n");

export const toolUsesOf = (entries: Array<Entry>) =>
  entries
    .flatMap((entry) =>
      entry.type === "assistant" && Array.isArray(entry.message?.content)
        ? (entry.message.content as Array<ToolUse>)
        : [],
    )
    .filter((part) => part.type === "tool_use");

export const searchedOf = (toolUses: Array<ToolUse>) =>
  toolUses.some(
    (part) =>
      SEARCH_TOOLS.test(part.name ?? "") ||
      (part.name === "Skill" && SEARCH_SKILLS.test(part.input?.skill ?? "")) ||
      (part.name === "Bash" && SEARCH_COMMANDS.test(part.input?.command ?? "")),
  );

type Block = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

const blocksOf = (content: unknown): Array<Block> =>
  typeof content === "string"
    ? [{ type: "text", text: content }]
    : Array.isArray(content)
      ? content
      : [];

// Every message of the session, in the shape fast-jev-compaction takes.
export const messagesOf = (transcriptPath: string): Array<Message> =>
  readFileSync(transcriptPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Entry)
    .filter((entry) => (entry.type === "user" && !entry.isMeta) || entry.type === "assistant")
    .map((entry) => {
      const blocks = blocksOf(entry.message?.content);
      return {
        role: entry.type === "user" ? "user" : "assistant",
        text: blocks
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("\n"),
        toolUses: blocks
          .filter((block) => block.type === "tool_use")
          .map((block) => ({
            tool_use_id: block.id ?? "",
            tool: block.name ?? "",
            input: block.input ?? {},
          })),
        toolResults: blocks
          .filter((block) => block.type === "tool_result")
          .map((block) => ({
            tool_use_id: block.tool_use_id ?? "",
            text: textOf(block.content),
            isError: block.is_error ?? false,
          })),
      };
    });
