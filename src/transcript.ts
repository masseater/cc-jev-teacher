import { readFileSync } from "node:fs";

export type Entry = {
  type?: string;
  isMeta?: boolean;
  message?: { role?: string; content?: unknown };
  attachment?: { type?: string; prompt?: unknown; humanTurn?: boolean };
};

export type ToolUse = {
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

export const entriesOf = (transcriptPath: string) =>
  readFileSync(transcriptPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Entry);

const promptOf = (entry: Entry) => {
  if (entry.type !== "user" || entry.isMeta || entry.message?.role !== "user") return null;
  const text = textOf(entry.message.content).trim();
  return text && !text.startsWith("<") && !text.startsWith("Stop hook feedback") ? text : null;
};

export const instructionOf = (entries: Array<Entry>) =>
  entries
    .reduce<Array<string>>((turn, entry) => {
      if (entry.type === "user" && !entry.isMeta && entry.message?.role === "user") {
        const text = promptOf(entry);
        return text ? [text] : turn;
      }
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
    .slice(entries.findLastIndex((entry) => promptOf(entry) !== null) + 1)
    .flatMap((entry) =>
      entry.type === "assistant" && Array.isArray(entry.message?.content)
        ? (entry.message.content as Array<ToolUse>)
        : [],
    )
    .filter((part) => part.type === "tool_use");

export const searchedOf = (entries: Array<Entry>) =>
  toolUsesOf(entries).some(
    (part) =>
      SEARCH_TOOLS.test(part.name ?? "") ||
      (part.name === "Skill" && SEARCH_SKILLS.test(part.input?.skill ?? "")) ||
      (part.name === "Bash" && SEARCH_COMMANDS.test(part.input?.command ?? "")),
  );
