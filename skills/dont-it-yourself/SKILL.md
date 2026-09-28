---
name: dont-it-yourself
description: 新しい処理・関数・ツール・仕組みを書き始める前に使う。既にあるライブラリ・フレームワーク・ランタイムの機能で済まないかを探してから書く
---

# 自前で作らない

## 既製のものを探してから書く

- ライブラリ、フレームワーク、ランタイム、リポジトリの仕組みにある処理を自前で実装しない。
- 一般に定義された基準（RFC、W3C、ECMA、ISO、業界標準、広く使われる形式や規約）に沿った処理は、その基準を実装したライブラリがあるものとして探す。基準の名前と番号、形式の名前、扱うデータの名前で npm を検索し、メンテナンスが続いていること、型定義があること、依存が少ないことを確かめる。
- 既製の関数を包み直すだけのラッパーを作らない。
- 既製のものが要件の一部しか満たさないときは、足りない部分だけを書く。満たしている部分は書き直さない。拡張用の API やオプションがあれば、それを使って足す。

## この場面ではこれを使う

- 配列、オブジェクト、文字列のユーティリティ（`groupBy`、`chunk`、`debounce`、deep merge、深い等価比較）: `es-toolkit`
- 外から入る値の解析と検証（URL、メールアドレス、日付文字列、JSON の形）: `Schema`
- 環境や設定の値の読み取り: `Config`
- 秘密の値の保持とログからの隠蔽: `Redacted`
- 日付、時刻、時間帯、期間の計算と整形: `DateTime`、`Duration`
- retry と backoff: `Effect.retry` と `Schedule.exponential`、`Schedule.jittered`
- cron 式の解析と次回実行時刻: `Cron`
- base64、hex の encode と decode: `Encoding`
- UUID、乱数、ランダムな文字列: `crypto.randomUUID`、`Random`、`Encoding.randomHex`
- hash、署名、暗号: `crypto.subtle`
- 並行数の制限、ロック、キュー、キャッシュ: `Semaphore`、`Queue`、`Cache`
- 値の形による分岐: `Match`
- YAML の解析と出力: `yaml`
- Markdown の解析と変換: `remark`
- shell に渡す文字列のエスケープ: `shell-quote`
- CLI の引数解析とサブコマンド: `citty`
- 外部 HTTP のテストダブル: `msw`
- SQL の組み立てとマイグレーション: `drizzle-orm`
- 認証、セッション、パスキー、API キー: `better-auth`
- TOTP: `otpauth`
- サーバー状態の取得とキャッシュ: `@tanstack/react-query`
- フォームの状態と検証: `@tanstack/react-form`
- テーブルのソート、フィルタ、ページング: `@tanstack/react-table`
- 長いリストの仮想化: `@tanstack/react-virtual`
- React での debounce、throttle、rate limit: `@tanstack/react-pacer`

一覧にない場面は、Effect のモジュール、リポジトリの既存の依存、npm の順に探す。
