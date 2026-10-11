import { describe, expect, it } from "vite-plus/test";

import { appendedLog, count, requestLine, tally } from "./request-log.ts";

describe("request log", () => {
  it("records the hook, the model, the request count and a token estimate", () => {
    const sent = tally();
    count(sent, JSON.stringify({ state: "a b c", questions: {} }));
    count(sent, "x");
    const log = appendedLog("", requestLine("bash-output", "respan/span-01-lite", sent));
    const [line] = log
      .trim()
      .split("\n")
      .map((text) => JSON.parse(text));
    expect(line).toMatchObject({ hook: "bash-output", model: "respan/span-01-lite", requests: 2 });
    expect(line.tokens).toBeGreaterThan(0);
  });

  it("keeps only the newest part of a long log", () => {
    const log = appendedLog("old\n".repeat(1 << 19), "new\n");
    expect(log.length).toBeLessThanOrEqual((1 << 20) + 4);
    expect(log.endsWith("old\nnew\n")).toBe(true);
  });
});
