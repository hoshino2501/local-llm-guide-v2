locals {
  waf_visibility = { cloudwatch_metrics_enabled = true, sampled_requests_enabled = true }
}

resource "aws_wafv2_web_acl" "main" {
  provider = aws.us_east_1
  name     = "${local.name}-cf"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # 1) /api/ への大量リクエスト(課金対策の主力)
  rule {
    name     = "rate-limit-api"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit
        evaluation_window_sec = var.waf_rate_window_seconds
        aggregate_key_type    = "IP"
        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "rate-limit-api"
    }
  }

  # 2) サイト全体への大量リクエスト
  rule {
    name     = "rate-limit-all"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit_global
        evaluation_window_sec = var.waf_rate_window_seconds
        aggregate_key_type    = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "rate-limit-all"
    }
  }

  # 3) 既知の悪性IP
  rule {
    name     = "aws-ip-reputation"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "aws-ip-reputation"
    }
  }

  # 4) 共通ルール。技術Q&Aではコマンドやコードが本文に含まれ誤検知しやすいため、
  #    本文(BODY)系ルールは Count にして記録のみとする。URI/ヘッダ系は Block のまま。
  rule {
    name     = "aws-common"
    priority = 4
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
        dynamic "rule_action_override" {
          for_each = [
            "SizeRestrictions_BODY",
            "CrossSiteScripting_BODY",
            "GenericLFI_BODY",
            "GenericRFI_BODY",
            "EC2MetaDataSSRF_BODY",
          ]
          content {
            name = rule_action_override.value
            action_to_use {
              count {}
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "aws-common"
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    sampled_requests_enabled   = true
    metric_name                = "${local.name}-cf"
  }
}
