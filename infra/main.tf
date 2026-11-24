# Hosting for one environment (staging or production): a Cloudflare Pages project (direct upload,
# deployed by GitHub Actions with wrangler), its custom domain, and the DNS record pointing at it.
#
# State lives in Cloudflare R2 through the S3 backend; one state file per environment (see README).

terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.29"
    }
  }

  # Configured at init time:
  #   terraform init -backend-config=backend.hcl -backend-config="key=<environment>.tfstate"
  # with AWS_ENDPOINT_URL_S3=https://<account_id>.r2.cloudflarestorage.com and R2 S3 credentials in
  # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
  backend "s3" {}
}

provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from the environment.
}

locals {
  is_prod  = var.environment == "production"
  project  = local.is_prod ? var.app_name : "${var.app_name}-staging"
  hostname = "${local.project}.${var.zone_name}"
}

data "cloudflare_zone" "site" {
  filter = {
    name    = var.zone_name
    account = { id = var.account_id }
  }
}

resource "cloudflare_pages_project" "app" {
  account_id        = var.account_id
  name              = local.project
  production_branch = "main"
}

resource "cloudflare_pages_domain" "app" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.app.name
  name         = local.hostname
}

resource "cloudflare_dns_record" "app" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = local.hostname
  type    = "CNAME"
  content = cloudflare_pages_project.app.subdomain
  proxied = true
  ttl     = 1
  comment = "Managed by Terraform (note-reading-practice, ${var.environment})"
}
