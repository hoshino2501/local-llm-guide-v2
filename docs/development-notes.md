# 開発メモ

最終更新: 2026-11-08 ／ 対象: 移行後システム(計画資料「ローカルLLM構築ガイド 代替サイト構築計画」)

## 1. 開発経緯

| 日付 | 内容 |
|---|---|
| 2026-11-06 | 計画資料の作成(GPTs 終了 2026-12-11 に備えた AWS 代替サイト構築計画) |
| 2026-11-07 | 計画資料をもとに初版を開発。設計/運用ドキュメント、LP とチャット画面、Lambda バックエンド、Terraform を作成 |
| 2026-11-08 | 本メモを追加 |

### 開発時に確認して決めた事項(2026-11-07)

計画資料の「決めること」のうち、次のとおり決めて実装した。

| 項目 | 決定 | 備考 |
|---|---|---|
| IaC | Terraform | 計画資料で指定 |
| Lambda の言語 | Node.js 22 / TypeScript | Function URL のレスポンスストリーミングがネイティブ対応 |
| モデル | Claude Sonnet 系を既定(変数で変更可) | ID は仮置き。要確認(後述) |
| ログ | 質問内容は保存しない | メタデータのみ記録。LP の「プライバシー安心」と整合 |
| ドメイン | CloudFront 標準ドメインで開始 | 独自ドメインは Terraform 変数で後付け可能 |
| プロンプト | ダミー | GPTs の指示文に差し替える前提 |

### 実装で判断した主な点

- 構成部品は S3 / CloudFront / WAF / Lambda / Bedrock のみ。API Gateway・DynamoDB・Cognito は使わない。
- Lambda は CloudFront の OAC(SigV4)経由のみ受け付ける(`AWS_IAM`)。そのため POST 時に `x-amz-content-sha256` が必須で、チャット画面が自動付与する。
- 会話履歴はブラウザの `sessionStorage` のみ。サーバーは状態を持たず、件数・文字数の上限で切り詰める。
- 技術 Q&A はコマンドやコードを含み WAF の共通ルールが誤検知しやすいため、本文系ルールは Count(記録のみ)にした。
- CloudFront のカスタムエラーページは `/api/*` の応答まで書き換えるため設定していない。
- フロントは依存なしの素の HTML/JS。外部フォント・CDN は使わない(プライバシー・CSP)。
- `chat.ts` は AWS 依存なし。`MOCK_BEDROCK=1` で AWS なしの UI 確認ができる。

設計の詳細は [docs/design/](design/) を参照。

## 2. 現在の状態

| 項目 | 状態 |
|---|---|
| バックエンド(型チェック・単体テスト 9 件・ビルド) | 成功 |
| Terraform(`fmt`・`validate`) | 成功 |
| ローカル(モック)でのチャット動作 | 確認済み(5 ガイドのタブ切替、SSE 表示、Markdown 描画) |
| 実 Bedrock での応答 | **未検証** |
| AWS へのデプロイ(`terraform apply`) | **未実施** |
| スマホ実機・各ブラウザでの表示 | **未検証**(ローカルの簡易確認のみ) |
| コミット | 未実施(ステージ済みのみ。作業ブランチ `claude/post-migration-system-dev-55c582`) |

## 3. 対応が必要な点(TODO)

優先度: **A** = 公開前に必須 / **B** = 切替前までに実施 / **C** = 公開後でよい

### 内容・判断が必要なもの

| 優先 | 項目 | 内容 | 期限の目安 |
|---|---|---|---|
| A | プロンプトの差し替え | `backend/prompts/*.md` は暫定ダミー。GPTs の「指示」を移植する | 11/13(棚卸し) |
| A | ナレッジの配置 | GPTs のナレッジを Markdown 化して `backend/knowledge/` へ。公開してよい内容のみ | 11/13 |
| A | GPTs のバックアップ | 指示・ナレッジ・説明文・会話スターターを手元に保存(12/11 以降取り出せない可能性) | 11/13 |
| A | Bedrock モデル確定 | `bedrock_model_id` は例。利用可能 ID を確認し、モデルアクセスを有効化。日本語の技術質問で品質比較して決定 | 11/27 |
| A | LP の文言 | 現行 LP を参照できていないため文言・運営者表記・問い合わせ先は仮。現行に合わせて修正 | 11/27 |
| A | 費用上限・負担者 | `monthly_budget_usd`(既定 50)を最新料金表で試算して決定。負担者・管理者を決める | 11/27 |
| B | 連絡体制 | [障害対応](operations/03-incident-response.md) の連絡体制表を記入 | 12/4 |
| B | 独自ドメインの要否 | 使う場合は `domain_name` 等を設定(未使用なら標準ドメインのまま) | 構築前 |
| B | 旧 LP(Vercel)の扱い | カードのリンク差し替え or DNS 切替。旧 URL から新サイトへ到達できるようにする | 12/4〜12/10 |
| C | Bedrock Guardrails | 必要なら追加([設計 03](design/03-security-cost.md)) | 公開後 |
| C | Knowledge Bases | ナレッジが約 40 万文字を超えたら第 2 段階へ | 必要時 |

### 技術的な検証が必要なもの(未検証の前提)

| 優先 | 項目 | 内容 |
|---|---|---|
| A | OAC + POST + ストリーミング | CloudFront → Lambda Function URL(OAC、`RESPONSE_STREAM`)の疎通は実環境未確認。`scripts/smoke-test.sh` で確認する。403 の場合は `x-amz-content-sha256`、Lambda permission(`InvokeFunctionUrl` と `InvokeFunction` の 2 本)を確認 |
| A | プロンプトキャッシュ | `cachePoint` 付き Converse がモデルで通るか未確認。エラーなら `enable_prompt_cache = false` |
| A | Bedrock の IAM | 基盤モデル ARN は `anthropic.*` のワイルドカード、推論プロファイルは自アカウント分。実際の呼び出しが通るか要確認(Anthropic 以外のモデルは ARN 変更が必要) |
| A | Lambda 同時実行数の予約 | 新規アカウントでは設定できない場合あり(`lambda_reserved_concurrency`)。失敗したら引き上げ申請か `-1` |
| B | WAF の閾値 | 既定(`/api/` は 100 回/5 分/IP)は仮。共有 NAT(学校・企業)の利用者が誤ってブロックされないか、運用開始後に調整 |
| B | WAF 共通ルールの Count | 本文系を Count にしている。誤検知が無いと確認できたら Block を検討 |
| B | アラーム閾値 | `alarm_hourly_invocations`(既定 1,000/時)は仮。告知後の実利用に合わせて調整 |
| B | 表示確認 | iOS Safari / Android Chrome / 各 PC ブラウザ、ダークモード、長文・連続質問・停止ボタン |
| B | 画面の不備確認 | チャット画面は未実装の細部あり(下記) |
| B | Terraform の実適用 | `plan` は未実行(AWS 認証が必要)。初回 `apply` の所要は 10〜15 分見込み |

### 既知の制約・改善候補

- 存在しない URL は S3 の標準エラー表示(カスタム 404 なし)。
- 入力検証エラーは HTTP 200 の SSE `error` で返す。ステータスでの監視はできない(ログの `status` を使う)。
- CloudFront 標準アクセスログは未有効化(プライバシー方針による)。有効化する場合は LP・チャット画面の表記を先に更新する。
- Budgets はアカウント全体が対象。アカウントを他用途と共用する場合はコストフィルタを検討。
- Markdown 描画は簡易実装(表・画像・入れ子リスト非対応)。
- エラー時、画面上のユーザー発言は残るが履歴(送信対象)からは外れる。再送は手入力。
- E2E テスト・CI(GitHub Actions 等)は未整備。単体テストは検証ロジックとプロンプト組み立てのみ。
- Terraform の `.terraform.lock.hcl` はコミット対象(プロバイダのバージョン固定)。

## 4. 次の一手(推奨順)

1. GPTs の指示・ナレッジをバックアップし、プロンプトとナレッジを反映する。
2. AWS(検証環境でも可)で Bedrock のモデルアクセスを有効化し、`terraform apply` → `scripts/deploy-web.sh` → `scripts/smoke-test.sh`。上記「未検証の前提」を解消する。
3. 質問セットで新旧 GPTs の回答を比較し、プロンプトを調整([切替チェックリスト](operations/04-cutover-checklist.md))。
4. LP 文言・連絡体制・予算を確定し、切替(12/4〜12/10)へ。

## 5. 関連ドキュメント

- [README](../README.md) ／ [設計](design/) ／ [運用](operations/)
- 計画資料: https://claude.ai/artifact/7EGGo4r19uJKum4uxNpdkH
