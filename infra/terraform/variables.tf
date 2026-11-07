variable "project" {
  description = "リソース名のプレフィックス"
  type        = string
  default     = "local-llm-guide"
}

variable "environment" {
  description = "環境名 (prod / stg など)"
  type        = string
  default     = "prod"
}

variable "region" {
  description = "Lambda・S3 を置くリージョン(Bedrock の提供状況を確認して選ぶ)"
  type        = string
  default     = "ap-northeast-1"
}

# ---- Bedrock ----
variable "bedrock_model_id" {
  description = <<-EOT
    Bedrock の modelId または推論プロファイル ID。日本語の技術質問での品質を検証して決める。
    例: jp.anthropic.claude-sonnet-4-5-20250929-v1:0 (東京/大阪のクロスリージョン推論プロファイル)
    デプロイ前に `aws bedrock list-inference-profiles` で利用可能な ID を確認し、Bedrock コンソールでモデルアクセスを有効化すること。
  EOT
  type        = string
  default     = "jp.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "bedrock_foundation_model_arns" {
  description = "Lambda に許可する Bedrock 基盤モデルの ARN。クロスリージョン推論は複数リージョンのモデルを呼ぶためリージョンはワイルドカード。"
  type        = list(string)
  default     = ["arn:aws:bedrock:*::foundation-model/anthropic.*"]
}

variable "max_output_tokens" {
  description = "1回の回答の最大出力トークン数(コストの上限に直結)"
  type        = number
  default     = 2048
}

variable "enable_prompt_cache" {
  description = "システムプロンプトのキャッシュを使うか(モデルが対応している場合)"
  type        = bool
  default     = true
}

# ---- 入力制限 (Lambda で強制) ----
variable "max_messages" {
  type    = number
  default = 20
}
variable "max_chars_per_message" {
  type    = number
  default = 4000
}
variable "max_total_chars" {
  type    = number
  default = 20000
}

# ---- Lambda ----
variable "lambda_memory_mb" {
  type    = number
  default = 512
}

variable "lambda_timeout_seconds" {
  description = "CloudFront オリジン応答タイムアウトの既定は30秒。60秒を超えるにはクォータ引き上げが必要。"
  type        = number
  default     = 60
}

variable "lambda_reserved_concurrency" {
  description = <<-EOT
    同時実行数の上限(コスト暴走の最終防壁)。-1 で無制限。
    注意: 新規アカウントはアカウント全体の上限が10で、予約すると未予約枠が10を下回り設定できない。
    その場合は Service Quotas で引き上げるか、-1 にして WAF と Budgets で守る。
  EOT
  type        = number
  default     = 10
}

variable "log_retention_days" {
  type    = number
  default = 30
}

# ---- WAF ----
variable "waf_rate_limit" {
  description = "同一IPからの /api/ へのリクエスト上限(waf_rate_window_seconds あたり)"
  type        = number
  default     = 100
}

variable "waf_rate_window_seconds" {
  description = "レートベースルールの集計窓。60/120/300/600 のいずれか。"
  type        = number
  default     = 300
}

variable "waf_rate_limit_global" {
  description = "全体の公開サイト向け: 同一IPからの全リクエスト上限(waf_rate_window_seconds あたり)"
  type        = number
  default     = 2000
}

# ---- ドメイン(任意) ----
variable "domain_name" {
  description = "独自ドメイン(例: guide.example.org)。空なら CloudFront 標準ドメインを使う。"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "domain_name を持つ Route 53 ホストゾーンID。指定すると ACM 検証と A レコードを自動作成。空なら手動で DNS 設定。"
  type        = string
  default     = ""
}

# ---- 運用 ----
variable "alert_emails" {
  description = "アラーム・予算通知の送信先メールアドレス(SNS 購読の確認メールが届く)"
  type        = list(string)
  default     = []
}

variable "monthly_budget_usd" {
  description = "AWS Budgets の月額上限(USD)。アカウント全体が対象。"
  type        = number
  default     = 50
}

variable "alarm_hourly_invocations" {
  description = "Lambda の1時間あたり呼び出し数がこれを超えたらアラーム(異常アクセス検知)"
  type        = number
  default     = 1000
}

variable "acm_certificate_arn" {
  description = "us-east-1 の既存 ACM 証明書 ARN。domain_name 指定時、route53_zone_id が無い場合はこちらが必須。"
  type        = string
  default     = ""
}
