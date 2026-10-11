import type { JevAnswer, JevQuestions, JevResponse, JevState } from "./types.js";

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
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("answers" in parsed) ||
    parsed.answers === null ||
    typeof parsed.answers !== "object"
  ) {
    throw new Error("Jev response is missing answers");
  }
  return parsed as JevResponse;
}

/** The `noul` probability of one answer; throws when it is not there. */
export function noulAnswer(answers: Record<string, JevAnswer>, name: string): number {
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
