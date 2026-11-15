import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ORIGINAL = "plugins/cc-jev-pruner";
const COPY = "plugins/cc-jev-teacher";
const SHARED = [
  "src/backend.ts",
  "src/request-log.ts",
  "src/tokens.ts",
  "src/compaction/LICENSE",
  "src/compaction/state.ts",
  "src/compaction/types.ts",
];
const ATTRIBUTES = ".gitattributes";

const root = join(import.meta.dirname, "..");
const check = process.argv.includes("--check");

const sameContent = (file: string, content: Buffer | string): boolean =>
  existsSync(file) && readFileSync(file).equals(Buffer.from(content));

const write = (file: string, content: Buffer | string): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

const copies = SHARED.map((file) => ({
  to: join(root, COPY, file),
  content: readFileSync(join(root, ORIGINAL, file)),
}));
const attributes = {
  to: join(root, COPY, ATTRIBUTES),
  content: SHARED.map((file) => `${file} linguist-generated\n`).join(""),
};

const stale = [...copies, attributes].filter(({ to, content }) => {
  if (sameContent(to, content)) return false;
  if (!check) write(to, content);
  return true;
});

if (check && stale.length > 0) {
  console.error(
    `${COPY} has stale copies of ${stale.map(({ to }) => to).join(", ")}. Run \`bun scripts/sync-shared.ts\`.`,
  );
  process.exit(1);
}
