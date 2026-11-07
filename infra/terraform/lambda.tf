# backend/dist は `npm run build` (または scripts/build-backend.sh) で作成しておく
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = local.dist_dir
  output_path = "${path.module}/.build/lambda.zip"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name}-chat"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name}-chat"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }
  statement {
    sid     = "InvokeBedrock"
    actions = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = concat(
      var.bedrock_foundation_model_arns,
      ["arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/*"],
    )
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "chat"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_lambda_function" "chat" {
  function_name = "${local.name}-chat"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_seconds

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      BEDROCK_MODEL_ID      = var.bedrock_model_id
      MAX_OUTPUT_TOKENS     = tostring(var.max_output_tokens)
      ENABLE_PROMPT_CACHE   = tostring(var.enable_prompt_cache)
      MAX_MESSAGES          = tostring(var.max_messages)
      MAX_CHARS_PER_MESSAGE = tostring(var.max_chars_per_message)
      MAX_TOTAL_CHARS       = tostring(var.max_total_chars)
    }
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.lambda.name
  }

  depends_on = [aws_iam_role_policy.lambda]
}

# Function URL: CloudFront の OAC(SigV4) 経由のみ。直接アクセスは 403。
resource "aws_lambda_function_url" "chat" {
  function_name      = aws_lambda_function.chat.function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "RESPONSE_STREAM"
}

resource "aws_lambda_permission" "cloudfront_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.chat.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.main.arn
  function_url_auth_type = "AWS_IAM"
}

# 2025年10月以降、Function URL の呼び出しには lambda:InvokeFunction も必要
resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chat.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.main.arn
}
