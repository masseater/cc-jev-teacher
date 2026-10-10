---
name: domain-naming
description: "クラス・関数・型・モジュールに、仕組み（処理・保存・変換・通信）ではなく業務で表すものの名前を付ける。名前を付けるとき、見直すとき、ドメインモデルをレビューするときに使う。Triggers: 命名, ドメイン, DDD, ユビキタス言語, 用語集, rename, naming."
---

<!-- jev-lint-ignore-file document-lacks-firsthand-evidence -->

# ドメインの言葉で名付ける

名前は、業務に詳しい人が同じものを指すときの言葉にする。HTTP・DB・CLIとの接続や汎用のユーティリティは、仕組みの名前でよい。

1. プロジェクトの用語集を探す。無ければREADMEと既存のコードから業務の言葉を拾う。
2. 対象が業務で何を表すかを一文で書く。書けなければ名付けずに、利用者に確かめる。
3. その一文の主語か目的語を名前にする。用語集の語があればそれを使い、同じものに別の語を当てない。
4. 新しい概念は用語集に足す。足し方は[mattpocock/skills](https://github.com/mattpocock/skills)リポジトリのdomain-modelingスキルに従う。
5. 見直すときは、[references/smells.md](references/smells.md) の兆候を手がかりに、仕組みで名付けたものを探す。
