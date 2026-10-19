terraform {
  # 1.11+: write-only attributes (value_wo), used in secrets.tf.
  required_version = ">= 1.11, < 2.0"

  # "~> 6.68" = any 6.x from 6.68 on, never 7.0 (a major version may break things).
  # The exact versions in use are recorded in .terraform.lock.hcl, which is committed.
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}
