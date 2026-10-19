output "app_url" {
  value = "https://${var.domain}"
}

output "next_step" {
  value = "Put the Sanity token and the PayU secrets into SSM (README.md, first-time setup), then deploy: node aws/ops/deploy.mjs"
}

# ---------------------------------------------------------------- read by aws/ops/*.mjs
# The ops scripts get every name from here (terraform output -json) instead of a config file,
# so they can't drift from what Terraform created.

output "region" {
  value = var.region
}

output "project" {
  value = var.project
}

output "assets_bucket" {
  value = aws_s3_bucket.assets.bucket
}

output "static_paths" {
  description = "Top-level asset entries CloudFront serves from S3 (besides _next/)."
  value       = var.static_paths
}

output "function_name" {
  value = aws_lambda_function.server.function_name
}

output "function_url" {
  description = "Direct Lambda URL. Must answer 403: only CloudFront sends the origin header."
  value       = aws_lambda_function_url.server.function_url
}

output "log_group" {
  value = aws_cloudwatch_log_group.server.name
}

output "distribution_id" {
  value = aws_cloudfront_distribution.cdn.id
}

output "distribution_domain" {
  value = aws_cloudfront_distribution.cdn.domain_name
}

output "ssm_params" {
  description = "Parameter Store names the server function reads."
  value       = local.params
}
