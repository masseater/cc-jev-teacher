import { noul } from "@typesafe-ai/sdk";

export const aiJapanese = {
  question: noul(
    "Would a native Japanese speaker find the Japanese prose the assistant wrote (`written` or `report`) unnatural? Count: AI-sounding framing by negation and contrast such as 「〜は〜で、〜ではない」, 「〜ではない。〜だ。」, 「単なる〜ではない」; stiff, translated-sounding phrasing; long chains of nouns joined by 「・」 or 「の」; heavy nominalization; insider jargon a person would not say out loud (such as 「ログを引く」「判断に効く」); and sentences packed with too many clauses. Code, identifiers, file paths, and quoted text do not count.",
  ),
  reason:
    "日本語が不自然です（「〜は〜で、〜ではない」のような否定と対比の言い回し、翻訳調、「・」や「の」で名詞を並べた文、仲間内でしか通じない言葉、詰め込みすぎた文など）。dead-cliche-writing スキルに沿って、自然な日本語に書き直してください。",
};
