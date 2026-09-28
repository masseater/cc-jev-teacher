import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    "*.md": [
      "bun node_modules/.bin/dead-cliche fix --write",
      "bun node_modules/.bin/dead-cliche check",
    ],
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    tasks: {
      check: {
        cache: false,
        command:
          "sh -c 'vp check && git ls-files -z \"*.md\" | xargs -0 bun node_modules/.bin/dead-cliche check && bunx @anthropic-ai/claude-code plugin validate .'",
      },
    },
  },
});
