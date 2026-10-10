import { describe, expect, it } from "vite-plus/test";
import type { ConversationMessage, HistoryEntry } from "./history.js";
import { estimateStateTokens } from "./jev.js";
import { trimOutput } from "./output.js";

describe("scoring request ordering under a fixed allowance", () => {
  it.each([0, 200])(
    "spends the allowance on output with a %i-character final message",
    async (padding) => {
      const lines = Array.from(
        { length: 600 },
        (_, index) => `progress module ${index}: ${"unchanged ".repeat(12)}`,
      );
      lines[45] = "Selected release: artifact-cobalt.tar.gz";
      const output = lines.join("\n");
      const messages: ConversationMessage[] = [
        ...Array.from({ length: 30 }, (_, index) => ({
          role: "user" as const,
          text: `Context ${index}: ${"details ".repeat(200)}`,
          toolUses: [],
        })),
        { role: "user", text: `KEEP_COBALT ${"x".repeat(padding)}`, toolUses: [] },
      ];
      const histories = new Set<string>();
      const scored = new Set<string>();
      let calls = 0;
      const result = await trimOutput(
        { command: "build", goal: "", output, messages },
        {
          async ask(state, questions) {
            calls += 1;
            const serialized = JSON.stringify((state as { history: HistoryEntry[] }).history);
            histories.add(serialized);
            expect(estimateStateTokens(JSON.stringify(state))).toBeLessThanOrEqual(6_000);
            for (const id of Object.keys(questions)) scored.add(id);
            return {
              answers: Object.fromEntries(
                Object.keys(questions).map((id) => [
                  id,
                  { noul: id === "c3" && serialized.includes("KEEP_COBALT") ? 1 : 0 },
                ]),
              ),
            };
          },
        },
        { maxStateTokens: 6_000, maxScoringRequests: 19 },
      );
      expect(calls).toBeLessThan(20);
      expect(histories.size).toBe(1);
      expect([...histories][0]).toContain("KEEP_COBALT");
      expect(scored.size).toBe(30);
      expect(result.trimmed).toBe(true);
      expect(result.output).toContain(lines[45]);
    },
  );
});
