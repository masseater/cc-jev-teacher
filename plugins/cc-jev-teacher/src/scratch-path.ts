import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const TEMPORARY = /^(\/tmp\/|\/private\/|\/var\/folders\/)/;

// Temporary files, and the session state Claude Code keeps under its config directory (transcripts, memory, jobs).
export const isScratch = (path: string) =>
  TEMPORARY.test(path) ||
  ["projects", "jobs"].some((dir) => path.startsWith(`${join(CONFIG_DIR, dir)}/`));
