import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const TEMPORARY = /^(\/tmp\/|\/private\/|\/var\/folders\/)/;

export const isScratch = (path: string) =>
  TEMPORARY.test(path) ||
  ["projects", "jobs"].some((dir) => path.startsWith(`${join(CONFIG_DIR, dir)}/`));
