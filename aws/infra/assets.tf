# Static files (.open-next/assets: _next/static/*, favicon.ico, public/*), uploaded by
# aws/ops/deploy.mjs. Private: only this CloudFront distribution can read it, through Origin
# Access Control (OAC).

resource "aws_s3_bucket" "assets" {
  # Bucket names are global across all AWS accounts; the account ID makes this one unique.
  bucket = local.names.assets_bucket
  # Everything in it comes from the build and is uploaded again by the next deploy, so
  # `terraform destroy` may empty it.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Access controlled by IAM and the bucket policy only (no ACLs).
resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "assets" {
  # Only CloudFront, and only on behalf of this distribution, may read objects.
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }

  # Only reachable over TLS.
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets.json

  # S3 rejects a bucket policy while the public access block is still being applied.
  depends_on = [aws_s3_bucket_public_access_block.assets]
}

resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = local.names.oac
  description                       = "CloudFront reads the ${var.project} assets bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
