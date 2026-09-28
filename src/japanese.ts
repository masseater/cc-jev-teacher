import { noul } from "@typesafe-ai/sdk";

export const aiJapaneseQuestion = noul(
  "Does the Japanese prose contain AI-sounding phrasing that frames a point by negation and contrast instead of stating it plainly, such as 「〜は〜で、〜ではない」, 「〜ではない。〜だ。」, 「単なる〜ではない」, or 「〜ではなく、〜だ」 used for emphasis? Ordinary factual negation, such as saying a file does not exist, does not count. Code, identifiers, and quoted text do not count.",
);

export const aiJapaneseReason =
  "「〜は〜で、〜ではない」「〜ではない。〜だ。」のような、否定と対比で言い切る AI っぽい言い回しがあります。言いたいことを肯定の形で素直に書き、自然な日本語に書き直してください。";
