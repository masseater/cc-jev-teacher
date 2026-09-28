import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

export const repositoryOf = (path: string) => {
  try {
    const root = git(dirname(path), "rev-parse", "--show-toplevel").trim();
    const files = git(root, "ls-files", "--cached", "--others", "--exclude-standard")
      .split("\n")
      .filter(Boolean);
    return { root, files };
  } catch {
    return undefined;
  }
};
