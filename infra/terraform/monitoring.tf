resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# Lambda エラー
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.name}-lambda-errors"
  alarm_description   = "チャット API (Lambda) でエラーが発生"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.chat.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# 同時実行数の上限に達した(利用集中、または攻撃の兆候)
resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${local.name}-lambda-throttles"
  alarm_description   = "Lambda がスロットリングされている(同時実行数の上限)"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.chat.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# 異常なアクセス量の検知
resource "aws_cloudwatch_metric_alarm" "lambda_invocations" {
  alarm_name          = "${local.name}-lambda-invocations"
  alarm_description   = "1時間あたりの呼び出し数が閾値を超過(異常アクセス・課金増の兆候)"
  namespace           = "AWS/Lambda"
  metric_name         = "Invocations"
  dimensions          = { FunctionName = aws_lambda_function.chat.function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = var.alarm_hourly_invocations
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# AWS Budgets(アカウント全体の月額)。実績 50/80/100% と予測 100% で通知。
resource "aws_budgets_budget" "monthly" {
  count        = length(var.alert_emails) > 0 ? 1 : 0
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
    }
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }
}
