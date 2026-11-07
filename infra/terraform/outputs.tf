output "site_url" {
  description = "公開URL"
  value       = local.use_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "キャッシュ無効化(invalidation)に使用"
  value       = aws_cloudfront_distribution.main.id
}

output "web_bucket" {
  description = "web/ を同期する S3 バケット"
  value       = aws_s3_bucket.web.bucket
}

output "lambda_function_name" {
  value = aws_lambda_function.chat.function_name
}

output "lambda_log_group" {
  value = aws_cloudwatch_log_group.lambda.name
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
