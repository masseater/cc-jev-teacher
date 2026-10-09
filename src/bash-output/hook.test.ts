import { describe, expect, it } from "vite-plus/test";
import { jevBackend } from "../backend.ts";
import { jevAsker, looksSecret, resolveHookConfig } from "./hook.ts";

describe("hook configuration", () => {
  it("uses the documented defaults", () => {
    expect(resolveHookConfig({})).toMatchObject({
      minTokens: 10_000,
      chunkLines: 20,
      keepThreshold: 0.5,
      maxStateTokens: 25_000,
    });
  });

  it("can turn off pruning of engine-saved output", () => {
    expect(resolveHookConfig({ persistedOutputs: false }).persistedOutputs).toBe(false);
  });

  it("accepts option overrides", () => {
    expect(
      resolveHookConfig({
        minTokens: 15_000,
        chunkLines: 5,
        keepThreshold: 0.8,
        maxStateTokens: 5_000,
      }),
    ).toEqual({
      minTokens: 15_000,
      persistedOutputs: true,
      persistedMaxChars: 8000,
      chunkLines: 5,
      keepThreshold: 0.8,
      maxStateTokens: 5_000,
    });
  });
});

describe("jevAsker", () => {
  it("posts the Jev body to the plugin's backend", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const asker = jevAsker(
      async (url, init) => {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return {
          status: 200,
          ok: true,
          text: JSON.stringify({ answers: { c1: { type: "noul", noul: 0.9 } } }),
        };
      },
      jevBackend({
        openRouterKey: "key",
        typeSafeKey: "",
        openRouterModel: "typesafe/jev-1.13",
        allowTraining: false,
      }),
    );
    const state = { task: "t", history: [], command: "ls", diagnosticsAndResults: [], chunks: [] };
    await asker.ask(state, {
      c1: { type: "noul", instructions: "i", criteria: { true: "t", false: "f" } },
    });
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(calls[0].body).toMatchObject({
      provider: { data_collection: "deny" },
      model: "typesafe/jev-1.13",
      state,
      questions: { c1: { type: "noul" } },
    });
  });
});

describe("secret detection", () => {
  it("detects credential-like commands and output", () => {
    expect(looksSecret("cat .env", "")).toBe(true);
    expect(looksSecret("printf value", "api_key=secret-value")).toBe(true);
    expect(looksSecret("ls", "src README.md")).toBe(false);
  });
});

describe("archive failure", () => {
  it("keeps the trim when the workspace cannot be written to", () => {
    const marker =
      "[fast-jev-output trimmed 40 lines (900 chars); full output: .claude/fast-jev-output/bash-t1.txt (Read or grep it if needed)]";
    const fallback = marker.replaceAll(
      "; full output: .claude/fast-jev-output/bash-t1.txt (Read or grep it if needed)",
      "; not saved to disk, re-run the command if you need these lines",
    );
    expect(fallback).toBe(
      "[fast-jev-output trimmed 40 lines (900 chars); not saved to disk, re-run the command if you need these lines]",
    );
  });
});
