import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";

import type { Message } from "fast-jev-compaction";
import * as v from "valibot";

// A field that is dropped when it has an unexpected type, so one odd entry does not fail the hook.
const maybe = <T extends v.GenericSchema>(schema: T) => v.fallback(v.optional(schema), undefined);

const Entry = v.looseObject({
  type: maybe(v.string()),
  isMeta: maybe(v.boolean()),
  isCompactSummary: maybe(v.boolean()),
  message: maybe(v.looseObject({ role: maybe(v.string()), content: v.optional(v.unknown()) })),
  attachment: v.optional(v.unknown()),
});
type Entry = v.InferOutput<typeof Entry>;

const QueuedPrompt = v.object({
  type: v.literal("queued_command"),
  humanTurn: v.literal(true),
  prompt: v.string(),
});

const Block = v.looseObject({
  type: maybe(v.string()),
  text: maybe(v.string()),
  id: maybe(v.string()),
  name: maybe(v.string()),
  input: maybe(
    v.looseObject({
      file_path: maybe(v.string()),
      content: maybe(v.string()),
      new_string: maybe(v.string()),
      command: maybe(v.string()),
      skill: maybe(v.string()),
    }),
  ),
  tool_use_id: maybe(v.string()),
  content: v.optional(v.unknown()),
  is_error: maybe(v.boolean()),
});
const Blocks = v.fallback(v.array(v.fallback(Block, {})), []);

// Message content is either plain text or a list of blocks.
const blocksOf = (content: unknown) =>
  v.parse(Blocks, typeof content === "string" ? [{ type: "text", text: content }] : content);

const entryOf = (line: string) => v.parse(Entry, JSON.parse(line));

const SEARCH_TOOLS = /exa|websearch|webfetch|web_search|web_fetch|firecrawl|context7|jev_navigate/i;
const SEARCH_SKILLS = /dont-it-yourself|find-skills|firecrawl|deep-research/;
const SEARCH_COMMANDS =
  /\b(gh (api|search|repo view)|skills (find|add)|npm (view|search|info)|vp (info|view)|pnpm (view|info)|bun (pm view|info)|yarn (info|npm info)|curl\s[^|]*https?:\/\/|jg )/;

const textOf = (content: unknown) =>
  blocksOf(content)
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");

const promptOf = (entry: Entry) => {
  if (
    entry.type !== "user" ||
    entry.isMeta ||
    entry.isCompactSummary ||
    entry.message?.role !== "user"
  )
    return null;
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
        const entry = entryOf(line);
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
      return entry.type === "attachment" && v.is(QueuedPrompt, entry.attachment)
        ? [...turn, entry.attachment.prompt.trim()]
        : turn;
    }, [])
    .join("\n\n");

// Feedback that Stop hooks already gave during the current turn.
export const stopFeedbackOf = (entries: Array<Entry>) =>
  entries
    .filter((entry) => entry.type === "user")
    .map((entry) => textOf(entry.message?.content))
    .filter((text) => text.startsWith("Stop hook feedback"))
    .join("\n");

export const toolUsesOf = (entries: Array<Entry>) =>
  entries
    .filter((entry) => entry.type === "assistant")
    .flatMap((entry) => blocksOf(entry.message?.content))
    .filter((part) => part.type === "tool_use");

export const searchedOf = (toolUses: ReturnType<typeof toolUsesOf>) =>
  toolUses.some(
    (part) =>
      SEARCH_TOOLS.test(part.name ?? "") ||
      (part.name === "Skill" && SEARCH_SKILLS.test(part.input?.skill ?? "")) ||
      (part.name === "Bash" && SEARCH_COMMANDS.test(part.input?.command ?? "")),
  );

// Messages of the session as the model sees it: from the last compaction summary, which stands for everything before it.
export const messagesOf = (transcriptPath: string): Array<Message> => {
  const entries = readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean).map(entryOf);
  return entries
    .slice(
      Math.max(
        0,
        entries.findLastIndex((entry) => entry.isCompactSummary),
      ),
    )
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
};
