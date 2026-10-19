# Where Terraform keeps its state: in the S3 bucket created by ../bootstrap.
#
# A backend block can't use variables, so the bucket name (it contains the account ID) is
# passed at init time ("partial configuration"):
#   terraform init -backend-config="bucket=$(terraform -chdir=../bootstrap output -raw state_bucket)"
terraform {
  backend "s3" {
    key     = "simple-shop/infra.tfstate"
    region  = "eu-central-1"
    encrypt = true
    # Locking: a lock file next to the state stops two `apply`s from running at once.
    use_lockfile = true
  }
}
