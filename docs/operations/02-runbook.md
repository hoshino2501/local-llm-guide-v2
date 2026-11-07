# 02. 日常運用ランブック

## 定期作業

| 頻度 | 作業 | 方法 |
|---|---|---|
| 週次(開始〜1 か月は毎日) | 利用状況・エラー率・コストの確認 | 下記「Logs Insights クエリ」「コスト確認」 |
| 月次 | Budgets 実績確認、WAF ブロック状況、アラーム発報の振り返り | 同上 |
| 月次 | 依存パッケージの更新(`npm audit` / `npm outdated`)と再デプロイ | `cd backend && npm audit` |
| 四半期 | モデルの新版・提供終了(EOL)確認、料金表の見直し | Bedrock コンソール・公式ドキュメント |
| 随時 | プロンプト・ナレッジ更新 | 下記 |

## Logs Insights クエリ

対象ロググループ: `/aws/lambda/local-llm-guide-prod-chat`(`terraform output lambda_log_group`)。質問内容はログに無い。

日別・ガイド別の利用数とトークン:
```
fields @timestamp, guide, status, inputTokens, outputTokens, latencyMs
| filter event = "chat"
| stats count() as requests, sum(inputTokens) as inTok, sum(outputTokens) as outTok by bin(1d), guide
| sort bin(1d) desc
```

エラー率:
```
filter event = "chat"
| stats count() as total, sum(status != "ok") as errors by bin(1h)
```

応答時間(p50/p95):
```
filter event = "chat" and status = "ok"
| stats pct(latencyMs, 50) as p50, pct(latencyMs, 95) as p95 by bin(1d)
```

内部エラーの詳細(本文は含まない):
```
filter level = "error" | sort @timestamp desc | limit 50
```

## コスト確認

1. **Cost Explorer**: サービス別(Bedrock / Lambda / CloudFront / WAF / S3)で月次・日次を確認。
2. 日次の Bedrock 増加が出たら、Logs Insights でトークン数の急増(上記)と、WAF のブロック数(CloudWatch → メトリクス → WAFV2 → `rate-limit-api`)を突き合わせる。
3. 想定を超える場合の手段: `waf_rate_limit` を下げる、`max_output_tokens`/`max_total_chars` を下げる、`lambda_reserved_concurrency` を下げる、モデルを軽量なものへ変更。

## プロンプト・ナレッジの更新

1. ブランチを切り、`backend/prompts/*.md` または `backend/knowledge/**` を編集。
2. ローカル確認: `cd backend && npm test && npm run build`(サイズ警告を確認)。実 Bedrock で試す場合は `BEDROCK_MODEL_ID=... npm run dev`。
3. レビュー(特に: 回答範囲の記載、機密情報が含まれていないこと)。
4. `scripts/deploy-backend.sh`。Lambda が新しくなるため、コールドスタート後に新プロンプトが有効になる(**即時**。旧コンテナは差し替え後に使われない)。
5. 代表質問で回答を確認(`scripts/smoke-test.sh` + [質問セット](04-cutover-checklist.md#品質比較の質問セット))。

> ナレッジには**公開してよい情報のみ**を置くこと。サイトは匿名公開で、モデルが引用し得る。

## モデルの変更

1. Bedrock でモデルアクセスを有効化し、ID を確認(推論プロファイルか基盤モデルか)。
2. `terraform.tfvars` の `bedrock_model_id` を変更。基盤モデル ARN が `anthropic.*` 以外(例: Amazon Nova)の場合は `bedrock_foundation_model_arns` も変更(例: `arn:aws:bedrock:*::foundation-model/amazon.*`)。
3. モデルによってプロンプトキャッシュ非対応なら `enable_prompt_cache = false`。
4. `terraform apply` → 質問セットで品質確認 → 問題があれば元に戻す。

## 上限値の変更

`terraform.tfvars` の `waf_rate_limit` / `waf_rate_window_seconds` / `max_*` / `lambda_reserved_concurrency` / `alarm_hourly_invocations` を変更して `terraform apply`。LP の説明や利用者向け案内に関わる値(入力 4,000 文字など)は `web/chat/index.html` の `maxlength` と `chat.js` の表示も合わせる。

## ガイドの追加・変更

1. `backend/prompts/<id>.md` を作成(任意で `backend/knowledge/<id>/`)。
2. `backend/src/guides.ts` の `GUIDE_IDS` に追加。
3. `web/assets/guides.js` に表示情報(`id verb name role desc examples`)を追加(LP のカードとチャットのタブに自動反映)。
4. `cd backend && npm test`(全ガイドのプロンプト存在テストが通ること)→ `deploy-backend.sh` → `deploy-web.sh`。

## 運営者の引き継ぎ時の確認

- AWS アカウント・Terraform state バケットへのアクセス権の移管
- SNS 購読(`alert_emails`)・Budgets 通知先の更新
- 本書と [03](03-incident-response.md) の連絡先欄の更新
