import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import { inventory, retrieve } from "./index.ts";
import { renderResult } from "./render.ts";
import type { Evaluator } from "./types.ts";

const root = mkdtempSync(join(tmpdir(), "jevgrep-"));
mkdirSync(join(root, "src"));
writeFileSync(
  join(root, "src/events.py"),
  "def record_event(event):\n    EVENTS.append(event)\n\n\ndef send_events():\n    post(EVENTS)\n",
);
writeFileSync(join(root, "src/colors.ts"), "export const red = '#f00';\n");
afterAll(() => rmSync(root, { recursive: true, force: true }));

// Says no to questions that name colors.ts or whose source never touches EVENTS, yes to the rest.
const evaluator: Evaluator & { requests: number } = {
  requests: 0,
  async evaluate(request) {
    this.requests++;
    const touches = JSON.stringify(request.state).includes("EVENTS");
    return Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => [
        id,
        touches && !question.instructions.includes("colors.ts") ? 0.9 : 0.1,
      ]),
    );
  },
};

describe("retrieve", () => {
  it("returns the file that implements the behavior with its parsed source", async () => {
    const result = await retrieve(
      { root, query: "How are events recorded?", signal: new AbortController().signal },
      evaluator,
    );

    expect(result.status).toBe("complete");
    expect(result.files.map((file) => file.path)).toContain("src/events.py");
    expect(result.files.map((file) => file.path)).not.toContain("src/colors.ts");
    expect(renderResult(result)).toContain("def record_event(event):");
  });
});

describe("inventory", () => {
  it("counts the files a search may read without asking Jev", async () => {
    const before = evaluator.requests;
    const result = await inventory({ root, signal: new AbortController().signal });

    expect(result.status).toBe("complete");
    expect(evaluator.requests).toBe(before);
  });
});
