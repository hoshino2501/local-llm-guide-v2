# 02. API 仕様

## POST `/api/chat`

ガイドを指定してチャットし、回答を SSE で逐次受け取る。

### リクエスト

ヘッダ:

| ヘッダ | 必須 | 説明 |
|---|---|---|
| `Content-Type: application/json` | ○ | |
| `x-amz-content-sha256` | ○ | リクエスト本文(バイト列)の SHA-256 の 16 進小文字。CloudFront OAC → Lambda Function URL で POST する際に必須。無いと 403 |

本文:

```json
{
  "guide": "know",
  "messages": [
    { "role": "user", "content": "Ollamaとは何ですか?" }
  ]
}
```

| フィールド | 型 | 制約 |
|---|---|---|
| `guide` | string | `know` / `run` / `decide` / `hardware` / `security`(許可リスト) |
| `messages` | array | 1 件以上。`role` は `user` / `assistant`。**最後は `user`** |
| `messages[].content` | string | 空不可、1 件 4,000 文字以内(`MAX_CHARS_PER_MESSAGE`) |

### 入力の整形(サーバー側)

1. 直近 20 件(`MAX_MESSAGES`)に切り詰め。
2. 合計 20,000 文字(`MAX_TOTAL_CHARS`)を超える間、古い方から削除。
3. 先頭が `assistant` なら `user` になるまで削除。連続する同一ロールは結合(Bedrock の制約)。
4. リクエスト本文は 64KB(`MAX_BODY_BYTES`)まで。

### レスポンス(成功: HTTP 200 `text/event-stream`)

各イベントは `data: <JSON>\n\n`。

| `type` | 例 | 意味 |
|---|---|---|
| `delta` | `{"type":"delta","text":"Ollamaは…"}` | 生成テキストの差分 |
| `done` | `{"type":"done","usage":{"inputTokens":812,"outputTokens":240}}` | 正常終了(最後に 1 回) |
| `error` | `{"type":"error","code":"invalid_guide","message":"…"}` | 検証エラー・内部エラー(最後に 1 回。以降の `delta` は無い) |

### エラー

| 状況 | HTTP | 形式 | `code` |
|---|---|---|---|
| メソッドが POST 以外 | 405 | JSON | `method_not_allowed` |
| 本文が 64KB 超 | 413 | JSON | `body_too_large` |
| JSON として不正 | 400 | JSON | `invalid_json` |
| 入力検証エラー | 200 | SSE `error` | `invalid_body` `invalid_guide` `invalid_messages` `empty_message` `message_too_long` |
| Bedrock 等の内部エラー | 200 | SSE `error` | `internal_error` |
| WAF レート制限 | 403 | WAF 既定 | — |
| `x-amz-content-sha256` 不正/欠落 | 403 | CloudFront/Lambda | — |
| Lambda 同時実行数超過 | 429/5xx | Lambda | — |

フロントエンドは `403`/`429` を「アクセス集中」として案内する。

### バージョニング

破壊的変更は `/api/v2/chat` のように別パスで追加する(`/api/*` は 1 つの CloudFront ビヘイビアで受けているため追加設定不要)。

## 画面 URL

| URL | 内容 |
|---|---|
| `/` | LP(5 つのガイドさんのカード) |
| `/chat/?guide=<id>` | チャット画面。`guide` 省略・不正時は `know` |
