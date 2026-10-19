# Names of everything, in one place. The ops scripts (aws/ops) read them back through outputs.tf.
locals {
  names = {
    assets_bucket   = "${var.project}-assets-${data.aws_caller_identity.current.account_id}"
    function        = "${var.project}-server"
    role            = "${var.project}-server-role"
    inline_policy   = "${var.project}-server"
    oac             = "${var.project}-assets"
    host_function   = "${var.project}-forwarded-host"
    origin_s3       = "assets"
    origin_function = "server"
  }

  ssm_prefix = "/${var.project}"

  # The app reads these at runtime (web/lib/config.ts uses the same names, relative to the prefix).
  params = {
    sanity_project_id     = "${local.ssm_prefix}/sanity/project-id"
    sanity_dataset        = "${local.ssm_prefix}/sanity/dataset"
    sanity_api_read_token = "${local.ssm_prefix}/sanity/api-read-token" # set with the AWS CLI, see README.md
    origin_verify         = "${local.ssm_prefix}/origin-verify"
  }

  # The header CloudFront adds to every request to the server function (web/proxy.ts checks it).
  origin_verify_header = "x-origin-verify"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
