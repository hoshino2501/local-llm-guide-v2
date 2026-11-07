# 03. 障害・インシデント対応

## 連絡体制(運用開始時に記入)

| 役割 | 担当 | 連絡先 |
|---|---|---|
| 一次対応(アラーム受信) | | |
| AWS アカウント管理者 | | |
| 広報・利用者告知 | | |

## アラーム別の対応

| アラーム | 意味 | 一次確認 | 対応 |
|---|---|---|---|
| `…-lambda-errors` | Lambda エラー 5 件/5 分以上 | CloudWatch Logs で `level="error"` を確認 | 下記「回答が返らない」へ |
| `…-lambda-throttles` | 同時実行上限に到達 | 利用集中か攻撃かを `lambda_invocations`・WAF で判別 | 正規の利用増なら `lambda_reserved_concurrency` を引き上げ。攻撃なら下記「不正アクセス・課金急増」 |
| `…-lambda-invocations` | 1 時間の呼び出しが閾値超 | Logs Insights で時間帯・ガイド別の件数を確認 | 告知・SNS 拡散による正規増か判断し、閾値見直し or 対策 |
| Budgets 通知(50/80/100%) | 月額上限に接近 | Cost Explorer でサービス別を確認 | 上限引き下げ施策([02](02-runbook.md#コスト確認))、100% 見込みなら緊急停止を検討 |

## 症状別

### 「回答が返らない / エラーになる」

1. `scripts/smoke-test.sh` で LP と API のどちらが落ちているか切り分ける。
2. Lambda ログのエラー名で判断:

| ログのエラー名 | 原因 | 対処 |
|---|---|---|
| `AccessDeniedException`(Bedrock) | モデルアクセス未有効化、IAM、モデル ID/リージョン誤り | Bedrock コンソールでモデルアクセス確認。`bedrock_model_id` と IAM ポリシーを確認 |
| `ThrottlingException` / `ServiceQuotaExceededException` | Bedrock のレート/クォータ超過 | 利用集中なら待機を案内。Service Quotas で引き上げ申請 |
| `ModelNotReadyException` / `ResourceNotFoundException` | モデル提供終了・ID 誤り | モデル変更([02](02-runbook.md#モデルの変更)) |
| `ValidationException`(cachePoint 関連) | モデルがプロンプトキャッシュ非対応 | `enable_prompt_cache = false` |
| `Task timed out` | 応答が `lambda_timeout_seconds` を超過 | `max_output_tokens` 低減、タイムアウト調整 |
| `プロンプトが見つかりません` | `prompts/<id>.md` 欠落(ビルド漏れ) | ビルドして再デプロイ |

3. ブラウザ側が 403: `x-amz-content-sha256`(フロント改修時に外れていないか)、WAF レート制限、OAC/Lambda permission を確認。

### 「LP は見えるがチャットだけ失敗」

CloudFront の `/api/*` ビヘイビア、Lambda Function URL(`AWS_IAM`)、`aws_lambda_permission` 2 本(`InvokeFunctionUrl` と `InvokeFunction`)を確認。`terraform plan` で差分が出ないかも確認する。

### 「LP が表示されない」

S3 にファイルがあるか(`aws s3 ls`)、CloudFront ディストリビューションの状態、直前の `deploy-web.sh` の結果を確認。`/chat` が 301 で `/chat/` に飛ぶのは正常。

## 不正アクセス・課金急増

1. **状況把握**: CloudWatch(WAF のブロック数・Lambda 呼び出し数)と Logs Insights(時間帯・トークン)。
2. **一次対策(即時・低リスク)**: `waf_rate_limit` を下げる(例 100 → 30)、`lambda_reserved_concurrency` を下げる、`max_output_tokens` を下げる → `terraform apply`。
3. **特定 IP が明確な場合**: WAF に IP Set ブロックルールを追加(WAF サンプルリクエストで発信元を確認)。
4. **収まらない場合**: [緊急停止](#緊急停止)。
5. 事後: 原因・損害額・再発防止を記録。Bedrock の請求は Cost Explorer の反映に遅れがあるため、翌日にも確認する。

## 緊急停止

API だけを止める(LP は残す)最短手順:

```bash
# Lambda の同時実行数を 0 にして全リクエストをスロットル(Terraform の値とずれるため、復旧は terraform apply で戻す)
aws lambda put-function-concurrency --function-name local-llm-guide-prod-chat --reserved-concurrent-executions 0 --region ap-northeast-1
```

復旧:
```bash
cd infra/terraform && terraform apply        # reserved concurrency が tfvars の値に戻る
```

サイト全体を止める場合は CloudFront ディストリビューションを無効化(コンソール、または tfvars/コードで `enabled = false` にして apply)。

## 情報漏えい・プライバシーの懸念への対応

- 本サイトは質問本文を保存しない設計のため、サーバー側に残るのは[メタデータのみ](../design/03-security-cost.md#3-プライバシー)。利用者から「機密を入力した」と連絡があった場合も、サーバー側に本文は残っていない旨を回答できる(ただし Bedrock のモデル呼び出しログを有効化していないことを AWS アカウントで確認すること)。
- ナレッジに非公開情報が混入していた場合: 該当ファイルを削除して**即時に再デプロイ**し、Git 履歴からも除去(必要なら履歴書き換え)。公開期間中の影響範囲を管理者へ報告。
- AWS 認証情報の漏えいが疑われる場合: 該当キーを無効化し、CloudTrail で不審な操作を確認。

## 事後対応テンプレート

```
発生日時 / 検知方法:
影響範囲(ガイド・期間・利用者への影響):
原因:
対応内容(時系列):
再発防止策:
利用者への告知の要否と文面:
```
