import { noul } from "@typesafe-ai/sdk";
import { defineHook, runHook } from "cc-hooks-ts";

import { hasApiKey, systemOne, THRESHOLD } from "./jev-checks.ts";
import { aiJapanese } from "./japanese.ts";
import { entriesOf, instructionOf, stopFeedbackOf, toolCallsOf, toolUsesOf } from "./transcript.ts";

const questions = {
  unfinished: noul(
    "Does the report state that some work the instruction asked the assistant to carry out now is still pending, such as not done, deferred, not deployed, or not verified? Ideas or proposals the instruction asked only to suggest, not to build, do not count. Questions for the user about security policy, billing, or a product choice do not count. Merely describing such states as a topic or feature does not count.",
  ),
  leftovers: noul(
    "Does the report state that test data, test accounts, keys, tokens or temporary files created during this work still remain, or ask the user whether to verify or clean up? Merely describing such things as a topic or feature does not count.",
  ),
  verbose: noul(
    "The report is verbose: besides a brief statement of what happened to each instructed item, it also tells how the work was done, the investigation steps, test results, or background explanation. The concrete numbers and their source that back a claim about a cause, frequency, latency, cost, or impact do not count. A short statement of where and how the result was verified (the environment and what was operated or checked) does not count. Plans, policies, or options that the report lays out for the user to decide on do not count.",
  ),
  planInChat: noul(
    "The report spells out plans, policies, or options in detail in the conversation itself for the user to review and decide on, instead of only naming the decisions the user has to make.",
  ),
  unmeasured: noul(
    "Does the report claim a cause, frequency, rate, latency, cost, size, or impact from guessing, using hedges such as probably, likely, seems, should, or maybe, or vague amounts such as many, often, fast, slow, or rarely, instead of the concrete number that was measured and where it came from (a log query, command output, or file)? Saying that something could not be measured, with the reason, does not count.",
  ),
  lumped: noul(
    'Does the response refer to several things the user has to decide or act on only as a group or a count (for example "five rules" or "three open questions") without naming each one and what it is?',
  ),
  isReport: noul(
    "Is the report a report on carrying out work the instruction asked for, rather than an answer or explanation to a question the user asked?",
  ),
  partial: noul(
    "Does the report admit that a problem it fixed also remains elsewhere, outside the part the assistant changed?",
  ),
  noPrevention: noul(
    "The report says the assistant fixed a bug, mistake, or problem, but it does not also put in place a measure that stops the same kind of problem from happening again (such as a lint rule, a type, a hook, a shared function, or a rule in AGENTS.md or a skill).",
  ),
  symptomOnly: noul(
    "Does the report say it fixed a problem only by working around or hiding the symptom (for example retries, catching and ignoring errors, special cases, hiding the output, or manual data fixes) instead of removing the underlying cause?",
  ),
  memoryDurable: noul(
    "The assistant saved to its own memory (a memory file or memory tool, see `tool_calls` and the report) something meant to apply from now on, such as a rule, decision, policy, convention, or how-to, instead of only temporary context for the work in progress. Writing to repository files such as AGENTS.md, CLAUDE.md, or a skill is not saving to memory.",
  ),
  askPermission: noul(
    "Is the assistant waiting for the user's permission to do something it could do by itself, such as installing, deploying, deleting, or running commands? Questions about billing, personal information, or product choices do not count.",
  ),
  reissue: noul(
    "Does the response ask or advise the user to issue, rotate, reissue, or revoke an API key, token, or secret?",
  ),
  localhost: noul("Does the response tell the user to open a localhost or 127.0.0.1 URL?"),
  unsourced: noul(
    "Does the response state facts about the latest versions, features, specifications, APIs, or prices of external software or services that the assistant did not check against a live primary source during this turn (see `tool_calls`)?",
  ),
  askedEnglish: noul("Does the instruction ask for the answer to be written in English?"),
  english: noul(
    "Is most of the report's prose written in English rather than Japanese? Code, identifiers, file paths, commands, URLs, and quoted UI text do not count.",
  ),
  aiJapanese: aiJapanese.question,
};

// Checks that may be given again in the same turn; every other reason is given at most once per turn.
const repeatable = new Set(["english", "aiJapanese"]);

type Question = keyof typeof questions;

const thresholds: Partial<Record<Question, number>> = { unfinished: 0.8, symptomOnly: 0.8 };

type Hit = (key: Question) => boolean;

// Listed in the order the reasons are shown. A check without `failed` fails when its own question hits.
const checks: Record<string, { reason: string; failed?: (hit: Hit) => boolean }> = {
  unfinished: {
    reason:
      "完了報告に、指示のうち未対応・先送り・未検証の項目が残っています。ユーザーの判断が要るもの（セキュリティの方針、課金、仕様の選択）以外は、今この場で対応・検証してから報告し直してください。",
  },
  leftovers: {
    reason:
      "完了報告に、検証や後片付け（テストデータ・テストユーザー・キーや一時トークン・一時ファイル）の残りや、それをやるかの確認が含まれています。確認を取らずに最後までやってから報告し直してください。",
  },
  lumped: {
    reason:
      "ユーザーに判断や対応を仰ぐものを、件数やひとまとめの呼び方で書いています。ユーザーが一つずつ判断できるよう、何があるのかを個別に挙げて書き直してください。",
  },
  planInChat: {
    reason:
      "ユーザーに計画や方針を求める必要が本当にある場合は、会話の中ではなくファイルに書き出して、ユーザーが視覚的に確認できる状態にしてください。会話には、決めてほしいことを一つずつ短く挙げるだけにしてください。",
    failed: (hit) => hit("planInChat") && hit("isReport"),
  },
  partial: {
    reason:
      "報告に、直した問題が他の箇所にも残っていると書かれています。共通の場所で直すか、同じ問題を持つ箇所をすべて直してから報告し直してください。他セッションが編集中のファイルなら、相談して直し切ってください。",
  },
  symptomOnly: {
    reason:
      "症状を回避・隠すだけの直し方になっていて、根本的な原因が解決されていません。原因を突き止めて取り除いてから報告し直してください。",
  },
  noPrevention: {
    reason:
      "直した問題に再発防止策がありません。同じ種類の問題がまた起きないよう、人の注意に頼らず仕組みで防ぐようにし、報告に書き足してください。",
  },
  unmeasured: {
    reason:
      "推測や曖昧な量（おそらく・〜のはず・多い・速い など）で書いています。measure-everything スキルに従ってください。原因・頻度・レイテンシ・費用・影響は、読み手が確かめられるよう、実際に計測した数値とその出どころを添えて書き直してください。計測できなかったものは、計測できなかったことと理由を書いてください。",
  },
  memoryDurable: {
    reason:
      "今後も効く決まり・判断・方針・手順をメモリに書いています。メモリは今の作業の間だけの一時的な情報に限り、今後も守るものは、ほかの人やエージェントにも効くようリポジトリに書いて、メモリからは消してください。",
  },
  askPermission: {
    reason:
      "自分でできることにユーザーの許可を求めています。課金・個人情報・仕様の選択以外は聞かずに実行し、結果を報告してください。",
  },
  reissue: {
    reason:
      "キーやトークンの発行・再発行・無効化をユーザーに頼んでいます。ユーザーの手を止めないよう、必要なキーは自分で発行し、再発行を勧める文は消してください。",
  },
  localhost: {
    reason:
      "ユーザーに localhost の URL を案内しています。ユーザーはこのマシンの画面を見られないので、ユーザーの端末から開ける形で公開し、その URL を案内し直してください。",
  },
  unsourced: {
    reason:
      "外部のソフトウェアやサービスの最新の仕様・バージョン・料金などを、このターンで調べずに書いています。古い知識で誤らないよう、一次情報で確かめてから書き直してください。",
  },
  english: {
    reason:
      "応答の地の文が英語になっています。日本語で書き直してください。コード・識別子・ファイルパス・UI 文言の引用は原文のままでかまいません。",
    failed: (hit) => hit("english") && !hit("askedEnglish"),
  },
  aiJapanese: { reason: aiJapanese.reason },
  verbose: {
    reason:
      "報告が冗長です。指示された各項目を今どうしたかと、動作確認をどこでどうしたかだけを、簡潔に書き直してください。作業の経緯・調べ方・後片付けの手順は書かないでください。",
    failed: (hit) => hit("verbose") && hit("isReport"),
  },
};

const hook = defineHook({
  trigger: { Stop: true },
  shouldRun: hasApiKey,
  run: async (context) => {
    const { input } = context;
    const report = input.last_assistant_message?.trim();
    if (!report) return context.success();
    const entries = entriesOf(input.transcript_path);
    const { answers } = await systemOne({
      state: {
        instruction: instructionOf(entries),
        report,
        tool_calls: toolCallsOf(toolUsesOf(entries)),
      },
      questions,
    });
    const given = stopFeedbackOf(entries);
    const scores: Partial<Record<Question, { noul: number }>> = answers;
    const hit: Hit = (key) => (scores[key]?.noul ?? 0) >= (thresholds[key] ?? THRESHOLD);
    const failed = Object.entries(checks)
      .filter(([key, check]) => repeatable.has(key) || !given.includes(check.reason))
      .filter(([key, check]) => (check.failed ? check.failed(hit) : hit(key as Question)))
      .map(([, check]) => `- ${check.reason}`);
    if (failed.length === 0) return context.success();
    return context.blockingError(failed.join("\n"));
  },
});

await runHook(hook);
