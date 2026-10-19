locals {
  # Added to every taggable AWS resource. Project=simple-shop identifies everything this stack creates.
  default_tags = {
    Project   = var.project
    ManagedBy = "terraform"
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = local.default_tags
  }
}

# CloudFront only accepts ACM certificates from us-east-1 (certificate.tf).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = local.default_tags
  }
}

# Credentials: the CLOUDFLARE_API_TOKEN environment variable (never put it in a .tf/.tfvars file).
# The token needs only Zone → DNS → Edit on the zone.
provider "cloudflare" {}
