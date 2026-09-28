import { readFileSync } from "node:fs";

import { noul } from "@typesafe-ai/sdk";

import { apiKey, clientOf } from "./client.ts";
import { entriesOf, instructionOf, searchedOf, toolUsesOf } from "./transcript.ts";
import type { Entry } from "./transcript.ts";

type StopInput = {
  transcript_path: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
};

const questions = {
  unfinished: noul(
    "Does the report state that some work the instruction asked the assistant to carry out now is still pending, such as not done, deferred, not deployed, or not verified? Ideas or proposals the instruction asked only to suggest, not to build, do not count. Questions for the user about security policy, billing, or a product choice do not count. Merely describing such states as a topic or feature does not count.",
  ),
  leftovers: noul(
    "Does the report state that test data, test accounts, keys, tokens or temporary files created during this work still remain, or ask the user whether to verify or clean up? Merely describing such things as a topic or feature does not count.",
  ),
  verbose: noul(
    "Is the report verbose: does it contain more than a brief statement of what happened to each instructed item, such as how the work was done, investigation steps, test results, or background explanation? The concrete numbers and their source that back a claim about a cause, frequency, latency, cost, or impact do not count. A short statement of where and how the result was verified (the environment and what was operated or checked) does not count.",
  ),
  unmeasured: noul(
    "Does the report claim a cause, frequency, rate, latency, cost, size, or impact from guessing, using hedges such as probably, likely, seems, should, or maybe, or vague amounts such as many, often, fast, slow, or rarely, instead of the concrete number that was measured and where it came from (a log query, command output, or file)? Saying that something could not be measured, with the reason, does not count.",
  ),
  isReport: noul(
    "Is the report a report on carrying out work the instruction asked for, rather than an answer or explanation to a question the user asked?",
  ),
  partial: noul(
    "Does the report admit that a problem it fixed also remains elsewhere, outside the part the assistant changed?",
  ),
  noPrevention: noul(
    "Does the report say it fixed a bug, mistake, or problem without also putting in place a measure that stops the same kind of problem from happening again (such as a lint rule, a type, a hook, a shared function, or a rule in AGENTS.md or a skill)?",
  ),
  symptomOnly: noul(
    "Does the report say it fixed a problem only by working around or hiding the symptom (for example retries, catching and ignoring errors, special cases, hiding the output, or manual data fixes) instead of removing the underlying cause?",
  ),
  memoryDurable: noul(
    "Did the assistant save to its own memory (see memory_writes, or the report) something meant to apply from now on, such as a rule, decision, policy, convention, or how-to, instead of only temporary context for the work in progress? memory_writes of (none) with a report that does not mention saving to memory does not count.",
  ),
  askPermission: noul(
    "Is the assistant waiting for the user's permission to do something it could do by itself, such as installing, deploying, deleting, or running commands? Questions about billing, personal information, or product choices do not count.",
  ),
  reissue: noul(
    "Does the response ask or advise the user to issue, rotate, reissue, or revoke an API key, token, or secret?",
  ),
  localhost: noul("Does the response tell the user to open a localhost or 127.0.0.1 URL?"),
  externalClaim: noul(
    "Does the response state facts about the latest versions, features, specifications, APIs, or prices of external software or services?",
  ),
  askedEnglish: noul("Does the instruction ask for the answer to be written in English?"),
};

type Check =
  | "unfinished"
  | "leftovers"
  | "english"
  | "verbose"
  | "partial"
  | "noPrevention"
  | "symptomOnly"
  | "unmeasured"
  | "memoryDurable"
  | "askPermission"
  | "reissue"
  | "localhost"
  | "unsourced";

const thresholds: Record<keyof typeof questions, number> = {
  unfinished: 0.8,
  leftovers: 0.7,
  verbose: 0.7,
  partial: 0.7,
  noPrevention: 0.7,
  symptomOnly: 0.8,
  unmeasured: 0.7,
  memoryDurable: 0.7,
  askPermission: 0.7,
  reissue: 0.7,
  localhost: 0.7,
  externalClaim: 0.7,
  askedEnglish: 0.7,
  isReport: 0.7,
};

const reasons: Record<Check, string> = {
  unfinished:
    "完了報告に、指示のうち未対応・先送り・未検証の項目が残っています。ユーザーの判断が要るもの（セキュリティの方針、課金、仕様の選択）以外は、今この場で対応・検証してから報告し直してください。",
  leftovers:
    "完了報告に、検証や後片付け（テストデータ・テストユーザー・キーや一時トークン・一時ファイル）の残りや、それをやるかの確認が含まれています。確認を取らずに最後までやってから報告し直してください。",
  english:
    "応答の地の文が英語になっています。日本語で書き直してください。コード・識別子・ファイルパス・UI 文言の引用は原文のままでかまいません。",
  partial:
    "報告に、直した問題が他の箇所にも残っていると書かれています。共通の場所で直すか、同じ問題を持つ箇所をすべて直してから報告し直してください。他セッションが編集中のファイルなら、相談して直し切ってください。",
  symptomOnly:
    "症状を回避・隠すだけの直し方になっていて、根本的な原因が解決されていません。原因を突き止めて取り除いてから報告し直してください。",
  noPrevention:
    "直した問題に再発防止策がありません。同じ種類の問題が起きないよう、lint・型・hook・共通の関数・AGENTS.md やスキルの決まりなどで防ぐ仕組みを入れ、報告に書き足してください。",
  verbose:
    "報告が冗長です。指示された各項目を今どうしたかと、動作確認をどこでどうしたかだけを、簡潔に書き直してください。作業の経緯・調べ方・後片付けの手順は書かないでください。",
  unmeasured:
    "推測や曖昧な量（おそらく・〜のはず・多い・速い など）で書いています。原因・頻度・レイテンシ・費用・影響は、実際に計測した具体的な数値と、その出どころ（ログのクエリ・コマンドの出力・ファイル）を添えて書き直してください。計測できなかったものは、計測できなかったことと理由を書いてください。",
  askPermission:
    "自分でできることにユーザーの許可を求めています。課金・個人情報・仕様の選択以外は聞かずに実行し、結果を報告してください。",
  reissue:
    "キーやトークンの発行・再発行・無効化をユーザーに頼んでいます。必要なキーは fish 関数（cf-token・oai-api など）で自分で発行し、再発行を勧める文は消してください。",
  localhost:
    "ユーザーに localhost の URL を案内しています。ユーザーはこのマシンの画面を見られないので、--host 0.0.0.0 などで公開し、このマシンの IP アドレス付きの URL を案内し直してください。",
  unsourced:
    "外部のソフトウェアやサービスの最新の仕様・バージョン・料金などを、このターンで調べずに書いています。検索して原文を読み、確かめてから書き直してください。",
  memoryDurable:
    "今後も効く決まり・判断・方針・手順をメモリに書いています。メモリは今の作業の間だけの一時的な情報に限り、今後も守るものはリポジトリ（AGENTS.md・スキル・ドキュメント）に書いて、メモリからは消してください。",
};

const JAPANESE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

const englishOf = (report: string) => {
  const lines = report
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  const english = lines
    .filter((line) => !JAPANESE.test(line) && (line.match(WORD) ?? []).length >= 4)
    .reduce((sum, line) => sum + line.length, 0);
  return total > 0 && english / total >= 0.5;
};

const memoryWritesOf =(entries: Array<Entry>) =>
  toolUsesOf(entries)
    .filter(
      (part) =>
        (part.name === "Write" || part.name === "Edit") &&
        /\/memory\//.test(part.input?.file_path ?? ""),
    )
    .map((part) => `${part.input?.file_path}\n${part.input?.content ?? part.input?.new_string ?? ""}`)
    .join("\n\n");

const main = async () => {
  const input = JSON.parse(readFileSync(0, "utf8")) as StopInput;
  const report = input.last_assistant_message?.trim();
  if (!report || !apiKey) return;
  const client = clientOf();
  const entries = entriesOf(input.transcript_path);
  const state = {
    instruction: instructionOf(entries),
    report,
    memory_writes: memoryWritesOf(entries) || "(none)",
  };
  const english = englishOf(report);
  if (input.stop_hook_active) {
    if (!english) return;
    const { answers } = await client.systemOne({
      state,
      questions: { askedEnglish: questions.askedEnglish },
    });
    if (answers.askedEnglish.noul >= thresholds.askedEnglish) return;
    process.stderr.write(`- ${reasons.english}`);
    process.exit(2);
  }
  const { answers } = await client.systemOne({ state, questions });
  const hit = (key: keyof typeof questions | "english") =>
    key === "english" ? english : answers[key].noul >= thresholds[key];
  const searched = searchedOf(entries);
  const failed = (
    [
      "unfinished",
      "leftovers",
      "partial",
      "symptomOnly",
      "noPrevention",
      "unmeasured",
      "memoryDurable",
      "askPermission",
      "reissue",
      "localhost",
      "unsourced",
      "english",
      "verbose",
    ] as const
  ).filter((key) =>
    key === "unsourced"
      ? hit("externalClaim") && !searched
      : hit(key) &&
        !(key === "english" && hit("askedEnglish")) &&
        !(key === "verbose" && !hit("isReport")),
  );
  if (failed.length === 0) return;
  process.stderr.write(failed.map((key) => `- ${reasons[key]}`).join("\n"));
  process.exit(2);
};

main().catch((error: unknown) => {
  process.stderr.write(`stop-report-check skipped: ${String(error)}\n`);
});
