# shop.piotrpieprzyk.com → CloudFront. DNS only (not proxied): CloudFront terminates TLS with the
# ACM certificate, so Cloudflare's proxy would only add a second CDN and break the certificate.

resource "cloudflare_dns_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.cdn.domain_name
  proxied = false
  ttl     = 300
  comment = "${var.project}: CloudFront (managed by Terraform)"
}
