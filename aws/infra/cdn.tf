# CloudFront: the public HTTPS endpoint. Hashed build files and public files come from S3,
# everything else from the server function.

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards all viewer headers, cookies and query strings, except Host: the function URL only
# answers to its own hostname.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# Host isn't forwarded (above), so the real one goes to Next.js as x-forwarded-host. Next.js needs
# it for redirects and absolute URLs.
resource "aws_cloudfront_function" "forwarded_host" {
  name    = local.names.host_function
  runtime = "cloudfront-js-2.0"
  comment = "Copies Host into x-forwarded-host"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      request.headers['x-forwarded-host'] = { value: request.headers.host.value };
      return request;
    }
  JS
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "${var.project}: ${var.domain}"
  aliases         = [var.domain]
  price_class     = "PriceClass_100"

  origin {
    origin_id                = local.names.origin_s3
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  origin {
    origin_id = local.names.origin_function
    # The function URL is https://<id>.lambda-url.<region>.on.aws/; CloudFront wants the bare host.
    domain_name = trimsuffix(trimprefix(aws_lambda_function_url.server.function_url, "https://"), "/")

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # CloudFront replaces a viewer-sent header of the same name, so it can't be faked from outside.
    custom_header {
      name  = local.origin_verify_header
      value = random_password.origin_verify.result
    }
  }

  # Hashed, immutable build files.
  ordered_cache_behavior {
    path_pattern           = "_next/static/*"
    target_origin_id       = local.names.origin_s3
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # public/ files and app/favicon.ico, one behavior per top-level entry.
  dynamic "ordered_cache_behavior" {
    for_each = var.static_paths
    content {
      # A folder in public/ matches everything below it.
      path_pattern           = endswith(ordered_cache_behavior.value, "/") ? "${ordered_cache_behavior.value}*" : ordered_cache_behavior.value
      target_origin_id       = local.names.origin_s3
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    }
  }

  # Pages and (from M3 on) API routes. Not cached for now; all methods, because Server Actions
  # and PayU notifications are POSTs.
  default_cache_behavior {
    target_origin_id         = local.names.origin_function
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.forwarded_host.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
