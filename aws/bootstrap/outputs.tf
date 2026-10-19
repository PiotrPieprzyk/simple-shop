output "state_bucket" {
  description = "Pass to ../infra: terraform init -backend-config=\"bucket=<this>\""
  value       = aws_s3_bucket.state.bucket
}
