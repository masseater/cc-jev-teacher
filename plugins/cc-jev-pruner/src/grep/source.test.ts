import { describe, expect, it } from "vite-plus/test";

import { inspect, type Inspection } from "./source.ts";

const summarize = async (path: string, source: string) => {
  const inspection: Inspection = await inspect({ path, contentHash: "", source });
  return {
    mode: inspection.mode,
    fallback: inspection.fallback,
    units: inspection.units.map(
      (unit) =>
        `${unit.name} ${unit.range.startLine}-${unit.range.endLine}` +
        (unit.ownerHeaders?.length
          ? ` [${unit.ownerHeaders.map((h) => `${h.startLine}-${h.endLine}`).join(",")}]`
          : ""),
    ),
    comments: inspection.comments.map((range) => `${range.startLine}-${range.endLine}`),
  };
};

const TS = `// Keeps the shared settings.
import { readFileSync } from "node:fs";

/**
 * Settings read from disk.
 */
export interface Settings {
  name: string; // shown in the title
}

export type Mode = "a" | "b";

export enum Color {
  Red,
  Blue,
}

export const first = 1,
  second = 2;

/* The loader. */
export function load(path: string): Settings {
  return JSON.parse(readFileSync(path, "utf8"));
}

namespace Outer.Inner {
  export const value = "日本語";
}

@sealed
export class Store<T> extends Base implements Reader {
  // Values by key.
  private values = new Map<string, T>();

  constructor(private readonly prefix: string) {
    super();
  }

  get size() {
    return this.values.size;
  }

  [Symbol.iterator]() {
    return this.values.values();
  }

  /** Reads one value. */
  read(key: string): T | undefined {
    return this.values.get(this.prefix + key); /* trailing */
  }
  ;
}

export class Empty {}

export default class {
  run() {}
}

load("x");
`;

const TSX = `import { useState } from "react";

// A counter.
export function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return (
    <button onClick={() => setCount(count + 1)}>
      {/* the count */}
      {count}
    </button>
  );
}

export class View extends Component<Props> {
  render() {
    return <div className="view">{this.props.children}</div>;
  }
}
`;

const JSX = `export const App = () => (
  <main>
    <h1>Title</h1>
  </main>
);

// The list.
function List({ items }) {
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}
`;

const JS = `#!/usr/bin/env node
// Entry point.
"use strict";

/**
 * @typedef {{ id: number }} Item
 */

/** @type {Item[]} */
const items = [];

/**
 * @param {Item} item
 * @returns {number}
 */
function add(item) {
  items.push(item);
  return items.length;
}

class Queue {
  #pending = [];

  /** @param {Item} item */
  push(item) {
    this.#pending.push(item);
  }

  static create() {
    return new Queue();
  }
}

module.exports = { add, Queue };
`;

describe("inspect", () => {
  it("splits TypeScript into declarations, class members and comments", async () => {
    expect(await summarize("src/store.ts", TS)).toEqual({
      mode: "typescript",
      fallback: undefined,
      units: [
        "source 2-2",
        "Settings 7-9",
        "Mode 11-11",
        "Color 13-16",
        "first, second 18-19",
        "load 22-24",
        "Outer 26-28",
        "Store.context 30-32 [30-32]",
        "Store.values 33-33 [30-32]",
        "Store.source 35-37 [30-32]",
        "Store.size 39-41 [30-32]",
        "Store.[Symbol.iterator] 43-45 [30-32]",
        "Store.read 48-50 [30-32]",
        "Store.source 51-51 [30-32]",
        "Empty 54-54",
        "source.context 56-56 [56-56]",
        "source.run 57-57 [56-56]",
        "source 60-60",
      ],
      comments: ["1-1", "4-6", "8-8", "21-21", "32-32", "47-47", "49-49"],
    });
  });

  it("parses .tsx with JSX", async () => {
    expect(await summarize("src/counter.tsx", TSX)).toEqual({
      mode: "typescript",
      fallback: undefined,
      units: [
        "source 1-1",
        "Counter 4-12",
        "View.context 14-14 [14-14]",
        "View.render 15-17 [14-14]",
      ],
      comments: ["3-3"],
    });
  });

  it("parses .jsx with JSX", async () => {
    expect(await summarize("src/app.jsx", JSX)).toEqual({
      mode: "typescript",
      fallback: undefined,
      units: ["App 1-5", "List 8-10"],
      comments: ["7-7"],
    });
  });

  it("parses JavaScript without turning JSDoc into declarations", async () => {
    for (const path of ["src/queue.js", "src/queue.mjs", "src/queue.cjs"])
      expect(await summarize(path, JS)).toEqual({
        mode: "typescript",
        fallback: undefined,
        units: [
          "source 3-3",
          "items 10-10",
          "add 16-19",
          "Queue.context 21-21 [21-21]",
          "Queue.#pending 22-22 [21-21]",
          "Queue.push 25-27 [21-21]",
          "Queue.create 29-31 [21-21]",
          "source 34-34",
        ],
        comments: ["2-2", "5-7", "9-9", "12-15", "24-24"],
      });
  });

  it("parses .mts and .cts as TypeScript", async () => {
    const source = "export const answer: number = 42;\n";
    for (const path of ["src/a.mts", "src/a.cts"])
      expect(await summarize(path, source)).toEqual({
        mode: "typescript",
        fallback: undefined,
        units: ["answer 1-1"],
        comments: [],
      });
  });

  it("picks the language variant from the extension", async () => {
    const source = "export const identity = <T>(value: T) => value;\n";
    expect(await summarize("src/identity.ts", source)).toMatchObject({
      fallback: undefined,
      units: ["identity 1-1"],
    });
    expect(await summarize("src/identity.tsx", source)).toMatchObject({
      mode: "text",
      fallback: "syntax",
    });
  });

  it("falls back to text on syntax errors but keeps the comments", async () => {
    const source = "// Broken.\nexport function broken( {\n  return 1;\n}\n/* after */\n";
    expect(await summarize("src/broken.ts", source)).toEqual({
      mode: "text",
      fallback: "syntax",
      units: ["source 1-6"],
      comments: ["1-1", "5-5"],
    });
  });

  it("falls back on an unterminated string", async () => {
    expect(await summarize("src/string.js", 'const text = "open;\n')).toMatchObject({
      mode: "text",
      fallback: "syntax",
    });
  });

  it("keeps a file of only comments as one text unit", async () => {
    expect(await summarize("src/notes.ts", "// one\n/* two\n   three */\n")).toEqual({
      mode: "typescript",
      fallback: undefined,
      units: ["source 1-4"],
      comments: ["1-1", "2-3"],
    });
  });

  it("returns the exact bytes of each unit", async () => {
    const source = "const a = '日本';\nclass B {\n  c() {}\n}\n";
    const inspection = await inspect({ path: "x.ts", contentHash: "", source });
    expect(
      inspection.units.map((unit) =>
        Buffer.from(source).subarray(unit.sourceByteStart, unit.sourceByteEnd).toString(),
      ),
    ).toEqual(["const a = '日本';\n", "class B {\n", "  c() {}\n"]);
  });
});
