# 03. セキュリティ・コスト・プライバシー設計

匿名公開のため、「悪用による課金」「範囲外の利用」「プライバシー」への備えを多層で行う。

## 1. 防御の層

| 層 | 対策 | 実装 |
|---|---|---|
| エッジ | `/api/` への IP 別レート制限(既定 100 回/5 分) | `waf.tf` `rate-limit-api` |
| エッジ | サイト全体の IP 別レート制限(既定 2,000 回/5 分) | `rate-limit-all` |
| エッジ | 悪性 IP 遮断(AWS IP Reputation) | `aws-ip-reputation` |
| エッジ | AWS 共通ルール(URI/ヘッダ系は Block、本文系は Count) | `aws-common` |
| 経路 | Lambda は CloudFront の OAC(SigV4)経由のみ。Function URL への直接アクセスは 403 | `AWS_IAM` + `aws_lambda_permission` |
| アプリ | `guide` を許可リストで検証。件数・文字数・本文サイズ上限 | `validate.ts` |
| アプリ | 1 回の最大出力トークン(既定 2,048) | `MAX_OUTPUT_TOKENS` |
| 実行 | Lambda 同時実行数の上限(既定 10) | `lambda_reserved_concurrency` |
| 監視 | Lambda エラー・スロットル・1 時間あたり呼び出し数のアラーム | `monitoring.tf` |
| 予算 | AWS Budgets(実績 50/80/100%、予測 100%)でメール通知 | `monitoring.tf` |
| ブラウザ | CSP(`default-src 'self'`)、HSTS、`X-Frame-Options: DENY`、`nosniff`、外部リソース不使用 | `cloudfront.tf` |
| 出力 | Markdown 描画は先に全文を HTML エスケープ、リンクは http(s) のみ | `web/assets/markdown.js` |

### WAF の共通ルールを Count にしている理由

技術 Q&A では本文にシェルコマンド・パス・HTML 断片が含まれ、`CrossSiteScripting_BODY` `GenericLFI_BODY` 等が誤検知しやすい。本文系ルールは **Count(記録のみ)** とし、入力は Lambda 側の検証と「モデルは本文をコマンドとして実行しない」構造(ツール未使用)で担保する。誤検知が無いと確認できたら Block へ変更を検討する。

## 2. 範囲外・不適切な質問

- 各プロンプトに回答範囲・断り方・システムプロンプト非開示を明記(`backend/prompts/*.md`)。
- ツール(外部実行・検索)をモデルに与えていないため、プロンプトインジェクションの被害は「不適切な文章が返る」に限定される。
- 必要に応じて **Bedrock Guardrails** を追加できる(`bedrock.ts` の `ConverseStreamCommand` に `guardrailConfig` を足す。IAM に `bedrock:ApplyGuardrail` も必要)。

## 3. プライバシー

| 項目 | 方針 |
|---|---|
| 質問・回答の本文 | **保存しない**。Lambda ログにも出さない(`chat.ts`) |
| 記録するメタデータ | 時刻・ガイド種別・結果ステータス・入出力トークン数・応答時間 |
| 会話履歴 | ブラウザの `sessionStorage` のみ。タブを閉じると消える |
| IP アドレス | WAF のサンプリング(直近約 3 時間・メトリクス用)に残る。CloudFront 標準アクセスログは**有効化していない** |
| Bedrock 側 | Bedrock はモデル学習にお客様データを使用しない。モデル呼び出しログ記録は**有効化しない**(設定状況をアカウントで確認すること) |
| 外部送信 | 外部フォント・解析タグ・CDN は使用しない |
| 利用者への明示 | LP とチャット画面に「Bedrock(AWS)で処理される」「保存しない」「個人情報を入力しない」を表記 |

> アクセスログ(CloudFront 標準ログ)や質問内容の保存を始める場合は、LP・チャット画面の表記と本書を**先に**更新すること。

## 4. コスト構造と見積もりの考え方

主なコストは **Bedrock のトークン料金**。その他(Lambda・CloudFront・WAF・S3)は小規模なら月数ドル(WAF は Web ACL とルール数に基づく固定費が主)。

```
1回の入力トークン ≒ システムプロンプト+ナレッジ + 会話履歴(上限 20,000 文字) + 質問
月額 ≒ 月間リクエスト数 × (入力 × 入力単価 + 出力 × 出力単価)
```

- ナレッジ同梱はシステムプロンプトが毎回入力に含まれる。`ENABLE_PROMPT_CACHE=true`(`cachePoint`)でキャッシュ読み取り単価が適用される(モデル・最小トークン数の条件あり)。
- 最大支出の上限は「WAF レート × Lambda 同時実行数 × 出力上限」で抑えられる。**単価は変動するため、最新の料金表で試算してから `monthly_budget_usd` を決める**。
- Budgets は**アカウント全体**が対象。他用途のアカウントと共用する場合はコストフィルタを検討。

## 5. 権限(最小権限)

- Lambda ロール: 自身のロググループへの書き込みと、`bedrock:InvokeModel*`(Anthropic 基盤モデル + 自アカウントの推論プロファイル)のみ。
- S3: 全パブリックアクセスをブロック。読み取りは当該 CloudFront ディストリビューションの OAC のみ(`AWS:SourceArn` 条件)。
- デプロイ担当者の IAM はこのリポジトリの範囲外。S3/CloudFront/Lambda/IAM/WAF/Budgets/SNS/CloudWatch/ACM/Route53 の作成権限が必要。
