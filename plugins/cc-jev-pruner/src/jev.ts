import type { Questions, SystemOneRequest, SystemOneResult } from "@typesafe-ai/sdk";

type Result = SystemOneResult<Questions>;

/** The body Jev answers with; only `answers` is checked, so `model` and `usage` may be absent. */
export type JevResponse = Pick<Result, "answers"> & Partial<Pick<Result, "model" | "usage">>;

/** Anything that can answer Jev questions, such as the hooks' OpenRouter adapter. */
export interface JevAsker {
  ask(state: SystemOneRequest["state"] | object, questions: Questions): Promise<JevResponse>;
}

function isJevResponse(value: unknown): value is JevResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "answers" in value &&
    value.answers !== null &&
    typeof value.answers === "object"
  );
}

/** Validates a Jev response body; throws on anything but an `answers` object. */
export function parseJevResponse(status: number, ok: boolean, text: string): JevResponse {
  if (!ok) {
    throw new Error(`Jev request failed (${status}): ${text.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Jev returned malformed JSON");
  }
  if (!isJevResponse(parsed)) {
    throw new Error("Jev response is missing answers");
  }
  return parsed;
}

/** The `noul` probability of one answer; throws when it is not there. */
export function noulAnswer(answers: JevResponse["answers"], name: string): number {
  const answer = answers[name];
  if (
    !answer ||
    !("noul" in answer) ||
    typeof answer.noul !== "number" ||
    !Number.isFinite(answer.noul)
  ) {
    throw new Error(`Invalid Jev answer for ${name}`);
  }
  return answer.noul;
}
