# TLS certificate for the shop's hostname. CloudFront only accepts certificates from us-east-1.
# ACM checks we own the name through DNS records, which Terraform writes to Cloudflare.

resource "aws_acm_certificate" "app" {
  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    # A replacement certificate is issued before the old one is removed, so CloudFront always has one.
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.app.domain_validation_options : option.domain_name => option
  }

  zone_id = var.cloudflare_zone_id
  # ACM gives fully qualified names with a trailing dot; Cloudflare stores them without it.
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  proxied = false
  ttl     = 60
  comment = "${var.project}: ACM validation (managed by Terraform)"
}

# Waits until ACM has issued the certificate (usually a few minutes).
resource "aws_acm_certificate_validation" "app" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for record in cloudflare_dns_record.certificate_validation : record.name]
}
