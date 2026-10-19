# The OpenNext server function: renders every page and (from M3 on) runs the Route Handlers.
# Terraform creates it with placeholder code; aws/ops/deploy.mjs uploads the real code.

resource "aws_cloudwatch_log_group" "server" {
  name              = "/aws/lambda/${local.names.function}"
  retention_in_days = var.log_retention_days
}

# Trust policy: WHO may assume the role (the Lambda service, on behalf of the function).
data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "server" {
  name               = local.names.role
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# Permissions policy: WHAT the role may do. Write its own logs and read the project's parameters
# (Sanity, PayU under /simple-shop/payu/*, the origin secret).
# SecureStrings use the AWS-managed aws/ssm key, which needs no extra kms:Decrypt grant.
# M4 and M5 add DynamoDB and SES here.
data "aws_iam_policy_document" "server" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.server.arn}:*"]
  }

  statement {
    sid     = "ReadParams"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/*",
    ]
  }
}

resource "aws_iam_role_policy" "server" {
  name   = local.names.inline_policy
  role   = aws_iam_role.server.id
  policy = data.aws_iam_policy_document.server.json
}

# Answers 503 until the first deploy replaces it.
data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/.terraform/tmp/placeholder.zip"

  source {
    filename = "index.mjs"
    content  = "export const handler = async () => ({statusCode: 503, body: 'Not deployed yet: run node aws/ops/deploy.mjs'});\n"
  }
}

resource "aws_lambda_function" "server" {
  function_name = local.names.function
  role          = aws_iam_role.server.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_s

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      # Only the parameter prefix, never values (web/lib/config.ts reads them from SSM).
      SSM_PREFIX = local.ssm_prefix
      NODE_ENV   = "production"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.server.name
  }

  lifecycle {
    # The deploy script owns the code. Without this, every apply would put the placeholder back.
    ignore_changes = [filename, source_code_hash, s3_key]
  }

  depends_on = [aws_iam_role_policy.server]
}

# Public HTTPS endpoint that CloudFront uses as its origin. No IAM auth (OAC would require
# x-amz-content-sha256 on POSTs, which browsers and PayU don't send). Instead CloudFront adds the
# secret x-origin-verify header, and web/proxy.ts rejects requests without it.
resource "aws_lambda_function_url" "server" {
  function_name      = aws_lambda_function.server.function_name
  authorization_type = "NONE"
}

# A function URL with authorization NONE also needs resource-based permissions for everyone:
# InvokeFunctionUrl, and (for URLs created since October 2025) InvokeFunction through the URL.
resource "aws_lambda_permission" "url_invoke_url" {
  statement_id           = "FunctionUrlPublicInvokeUrl"
  function_name          = aws_lambda_function.server.function_name
  action                 = "lambda:InvokeFunctionUrl"
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "url_invoke" {
  statement_id             = "FunctionUrlPublicInvoke"
  function_name            = aws_lambda_function.server.function_name
  action                   = "lambda:InvokeFunction"
  principal                = "*"
  invoked_via_function_url = true
}
