# AGENTS.md

<!-- jev-lint-ignore-file document-lacks-firsthand-evidence -->

このリポジトリのベースは https://github.com/masseater/typescript-template である。テンプレート由来の構成・方針はテンプレートに従う。

- 判定はコマンド名・語・ツール名の一覧で決め打ちしない。何を見分けたいかの考え方をJevへの質問に書き、判断に要る材料（コマンド、差分、このターンのtool呼び出しなど）をstateで渡す。一覧は、新しいツールや書き方が出るたびに漏れる
- フィードバックの文には目的と抽象的な手段だけを書き、具体的なコマンドやツールを指定しない
- 質問は「〜か？」と問う形ではなく、誰が何をしていれば当てはまるかを述べる文で書く
- 質問を変えたら、弾くべき例と通すべき例を本物のhookに通して、どちらも期待どおりになることを確かめる。既定の `respan/span-01-lite` で確かめる（有料モデルは使わない）
- Mergifyは使わない。push・PR・マージはgitとghで行う（`mergify-stack` スキルは読まない）
