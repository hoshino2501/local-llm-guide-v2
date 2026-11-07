# 01. 構築・デプロイ手順

## 前提

| ツール | バージョン |
|---|---|
| Terraform | 1.6 以上 |
| Node.js | 22 以上 |
| AWS CLI | v2(S3 同期・CloudFront 無効化に使用) |
| AWS 認証 | 下記リソースの作成権限(S3/CloudFront/Lambda/IAM/WAF/SNS/CloudWatch/Budgets/任意で ACM・Route53) |

## 初回構築

### 1. Bedrock の準備(コンソール)

1. 利用リージョン(既定 `ap-northeast-1`)で Bedrock の**モデルアクセス**を有効化する(利用モデルの提供元の利用規約への同意を含む)。
2. 使うモデル ID を確認する。クロスリージョン推論プロファイルを使う場合:
   ```bash
   aws bedrock list-inference-profiles --region ap-northeast-1 --query "inferenceProfileSummaries[].inferenceProfileId"
   ```
3. 選んだ ID を `bedrock_model_id` に設定する(選定は日本語の技術質問で比較してから)。

### 2. State バックエンド(推奨)

チームで運用する場合は S3 バックエンドを使う。

```bash
cd infra/terraform
cp backend.tf.example backend.tf   # バケット名を編集(バケットは事前に作成・バージョニング有効化)
```

### 3. 変数の設定

```bash
cp terraform.tfvars.example terraform.tfvars   # 編集
```

主な変数(全一覧は `variables.tf`):

| 変数 | 既定 | 説明 |
|---|---|---|
| `bedrock_model_id` | Claude Sonnet 4.5 の JP プロファイル(例) | 要確認・要モデルアクセス |
| `alert_emails` | `[]` | アラーム/予算の通知先。**空だと Budgets は作られない** |
| `monthly_budget_usd` | 50 | 月額上限(アカウント全体) |
| `waf_rate_limit` | 100 / 5 分 | `/api/` の IP 別上限 |
| `lambda_reserved_concurrency` | 10 | 同時実行数上限。設定できない場合は `-1` か Service Quotas 申請 |
| `domain_name` / `route53_zone_id` / `acm_certificate_arn` | 空 | 独自ドメイン(後述) |

### 4. バックエンドのビルドとインフラ作成

```bash
scripts/deploy-backend.sh        # 型チェック → テスト → ビルド → terraform init/apply(確認プロンプトあり)
```

`terraform apply` は初回 10〜15 分程度(CloudFront の作成が長い)。

### 5. フロントエンドの配置

```bash
scripts/deploy-web.sh
scripts/smoke-test.sh            # LP・チャット・API・不正入力の拒否を確認
```

### 6. 通知の購読確認

`alert_emails` 宛に **SNS の購読確認メール**が届く。「Confirm subscription」を押すまでアラームは届かない。Budgets は確認不要。

### 7. 動作確認

ブラウザで `site_url`(`terraform output site_url`)を開き、5 つのガイドそれぞれで質問する。

## 独自ドメインを使う場合

| ケース | 設定 |
|---|---|
| Route 53 に当該ゾーンがある | `domain_name` と `route53_zone_id` を設定 → ACM 検証と A/AAAA レコードを自動作成 |
| 他社 DNS | us-east-1 で証明書を手動発行 → `domain_name` と `acm_certificate_arn` を設定 → apply 後に `cloudfront_domain_name` への CNAME を DNS に追加 |

## 更新デプロイ

| 変更内容 | 手順 |
|---|---|
| プロンプト・ナレッジ・バックエンドコード | `scripts/deploy-backend.sh`(Lambda が差し替わる。コンテンツは Lambda 同梱) |
| LP・チャット画面 | `scripts/deploy-web.sh` |
| 上限値・モデル・WAF 等 | `terraform.tfvars` を編集 → `terraform plan` で差分確認 → `terraform apply` |

`terraform plan` の前に `make build` を実行して `backend/dist` を最新にすること(古いと差分が正しく出ない)。

## ロールバック

- **Lambda**: 前のコミットをチェックアウトして `scripts/deploy-backend.sh`。
- **Web**: S3 はバージョニング有効(30 日保持)。前のコミットで `scripts/deploy-web.sh` が簡便。
- **インフラ**: 前の tfvars/コードで `terraform apply`。
- **緊急停止**: [障害対応 03](03-incident-response.md#緊急停止) 参照。

## 撤去

```bash
cd infra/terraform && terraform destroy
```
S3 バケットは中身があると削除に失敗する。`aws s3 rm s3://<bucket> --recursive` の後、バージョニングの旧版も削除する。
