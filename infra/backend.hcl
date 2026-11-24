# Shared S3-backend settings for Cloudflare R2. The state `key` and the R2 endpoint
# (AWS_ENDPOINT_URL_S3) are supplied per run; see infra/README.md.
bucket                      = "notepractice-tfstate"
region                      = "auto"
use_path_style              = true
use_lockfile                = true
skip_credentials_validation = true
skip_region_validation      = true
skip_requesting_account_id  = true
skip_metadata_api_check     = true
skip_s3_checksum            = true
