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

# The Sanity read token is NOT managed here, so its value never enters the Terraform state. It's
# set once with `aws ssm put-parameter --type SecureString` (README.md). Terraform only knows its
# name (locals.tf), and the IAM policy (server.tf) covers it through the /simple-shop/* prefix.

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
