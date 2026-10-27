# AGENTS.md

- 判定はコマンド名・語・ツール名の一覧で決め打ちしない。何を見分けたいかの考え方をJevへの質問に書き、判断に要る材料（コマンド、差分、このターンのtool呼び出しなど）をstateで渡す
- フィードバックの文には目的と抽象的な手段だけを書き、具体的なコマンドやツールを指定しない
- 質問は「〜か？」と問う形ではなく、誰が何をしていれば当てはまるかを述べる文で書く
- 質問を変えたら、弾くべき例と通すべき例を本物のhookに通して、どちらも期待どおりになることを確かめる。既定の `respan/span-01-lite` で確かめる（有料モデルは使わない）
- Mergifyは使わない。push・PR・マージはgitとghで行う（`mergify-stack` スキルは読まない）
- マージ前に必ずbaseブランチを取り込み、手元の `vp run check` を通してからマージする。マージしてよいかは聞かない
- 定数・設定値・スキーマ・ルールのIDは一か所で定義し、ほかはそこから参照する
- デプロイ先や外部公開しているもの（サイト、API、プラグインなど）があれば、そのURLをREADMEに一覧で載せる

## コマンドと構成

- `vp run check` は `vite.config.ts` のタスクで、`vp check`・`vp test run`・`bun scripts/sync-shared.ts --check`・Markdownのdead-cliche・`claude plugin validate` をまとめて動かす。1ファイルのテストは `vp test run <path>` で動かす
- hookは `plugins/<plugin>/hooks/hooks.json` から `bun` で `src/` のTypeScriptを直接起動する。本物のhookに通すときは、hookの入力JSONを標準入力に渡して `bun plugins/cc-jev-teacher/src/<hook>.ts` を動かし、キーは `OPENROUTER_API_KEY` で渡す。キーが無いとhookは何もしない
- インストールされたpluginは自分のディレクトリしか読めない。teacherとprunerで共有するファイルはpruner側が原本なので、prunerを直してから `bun scripts/sync-shared.ts` でteacherへ写す
- Claude Codeは各pluginの `package.json` と `bun.lock` から依存を入れる。ルートの `package.json` は両pluginの依存とツールをまとめて持つので、依存を変えるときはpluginとルートの両方を揃える
