terraform {
  required_version = ">= 1.11, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }

  # No backend block: this config keeps its (tiny) state in a local file. It can't store its
  # state in the bucket it is about to create.
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "simple-shop"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

variable "region" {
  description = "AWS region of the state bucket. Must match the backend region in ../infra/backend.tf."
  type        = string
  default     = "eu-central-1"
}
