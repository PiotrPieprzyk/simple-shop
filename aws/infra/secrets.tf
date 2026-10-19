# SSM parameters the server function reads on a cold start (web/lib/config.ts). The Lambda
# environment holds only the prefix (SSM_PREFIX), never values.

# Not secret, so plain String parameters with values from terraform.tfvars.
resource "aws_ssm_parameter" "sanity_project_id" {
  name  = local.params.sanity_project_id
  type  = "String"
  value = var.sanity_project_id
}

resource "aws_ssm_parameter" "sanity_dataset" {
  name  = local.params.sanity_dataset
  type  = "String"
  value = var.sanity_dataset
}

resource "aws_ssm_parameter" "app_url" {
  name        = local.params.app_url
  description = "Public URL of the shop, for PayU's notifyUrl and continueUrl"
  type        = "String"
  value       = "https://${var.domain}"
}

resource "aws_ssm_parameter" "payu_base_url" {
  name  = local.params.payu_base_url
  type  = "String"
  value = var.payu_base_url
}

resource "aws_ssm_parameter" "payu_pos_id" {
  name  = local.params.payu_pos_id
  type  = "String"
  value = var.payu_pos_id
}

resource "aws_ssm_parameter" "payu_client_id" {
  name  = local.params.payu_client_id
  type  = "String"
  value = var.payu_client_id
}

# The Sanity read token and the PayU client secret and second key are NOT managed here, so their
# values never enter the Terraform state. They're set once with
# `aws ssm put-parameter --type SecureString` (README.md). Terraform only knows their names
# (locals.tf), and the IAM policy (server.tf) covers them through the /simple-shop/* prefix.

# The secret CloudFront sends as the x-origin-verify header, so the public function URL can't be
# used to bypass CloudFront (ROADMAP.md, Milestone 2, "Function URL protection").
#
# Unlike tic-tac-toe's passwords this isn't an `ephemeral` resource: the value must also go into
# the CloudFront origin config (cdn.tf), an ordinary attribute that can't take an ephemeral value.
# CloudFront's copy is in the state either way, which is the accepted trade-off (the state bucket
# is private and encrypted). `keepers` makes a new value when the version is bumped.
resource "random_password" "origin_verify" {
  length  = 48
  special = false
  keepers = {
    version = var.origin_verify_version
  }
}

resource "aws_ssm_parameter" "origin_verify" {
  name             = local.params.origin_verify
  description      = "Value of the ${local.origin_verify_header} header CloudFront adds to server requests"
  type             = "SecureString"
  value_wo         = random_password.origin_verify.result
  value_wo_version = var.origin_verify_version
}
