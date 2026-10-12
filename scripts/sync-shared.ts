// The teacher plugin carries its own copy of the files it shares with the pruner, because an
// installed plugin can read only its own directory. The pruner's files are the originals:
// `bun scripts/sync-shared.ts` copies them over, and `--check` fails when a copy differs.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
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

const root = join(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const stale = SHARED.filter((file) => {
  const from = join(root, ORIGINAL, file);
  const to = join(root, COPY, file);
  if (existsSync(to) && readFileSync(to).equals(readFileSync(from))) return false;
  if (!check) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  return true;
});

if (check && stale.length > 0) {
  console.error(
    `${COPY} has stale copies of ${stale.join(", ")}. Run \`bun scripts/sync-shared.ts\`.`,
  );
  process.exit(1);
}
