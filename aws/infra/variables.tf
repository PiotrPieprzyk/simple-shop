# Inputs of the stack. Non-secret values are set in terraform.tfvars.

# ---------------------------------------------------------------- general

variable "region" {
  description = "AWS region."
  type        = string
  default     = "eu-central-1"
}

variable "project" {
  description = "Prefix for names, and the value of the Project tag."
  type        = string
  default     = "simple-shop"
}

variable "domain" {
  description = "Public hostname of the shop (a DNS-only CNAME to CloudFront)."
  type        = string
  default     = "shop.piotrpieprzyk.com"
}

# ---------------------------------------------------------------- server function

variable "lambda_memory_mb" {
  description = "Lambda memory. CPU scales with it, so it also speeds up rendering and cold starts."
  type        = number
  default     = 1024
}

variable "lambda_timeout_s" {
  type    = number
  default = 15
}

variable "log_retention_days" {
  type    = number
  default = 14
}

# ---------------------------------------------------------------- CloudFront

variable "static_paths" {
  description = "Top-level entries of web/.open-next/assets/ besides _next/ and BUILD_ID (public/ files, app/favicon.ico). Each gets a CloudFront behavior that serves it from S3. aws/ops/deploy.mjs warns when this list is out of date."
  type        = list(string)
  default     = ["favicon.ico"]
}

variable "origin_verify_version" {
  description = "Bump to rotate the secret x-origin-verify header (new value in SSM and CloudFront; redeploy after)."
  type        = number
  default     = 1
}

# ---------------------------------------------------------------- Sanity (not secret; the token is set with the AWS CLI)

variable "sanity_project_id" {
  type    = string
  default = "elq0qoon"
}

variable "sanity_dataset" {
  type    = string
  default = "production"
}

# ---------------------------------------------------------------- Cloudflare

variable "cloudflare_zone_id" {
  description = "Cloudflare dashboard → your domain → Overview → API → Zone ID."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_zone_id))
    error_message = "cloudflare_zone_id must be the 32-character hex ID from the Cloudflare dashboard (set it in terraform.tfvars)."
  }
}
