import type { Register } from "claude-code";

import { register as registerBashOutput } from "../src/bash-output/hook.ts";
import { register as registerCompaction } from "../src/compaction/hook.ts";

export const register: Register = (on, options) => {
  registerCompaction(on, options);
  registerBashOutput(on, options);
};
