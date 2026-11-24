variable "environment" {
  description = "Which environment this state manages."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "account_id" {
  description = "Cloudflare account ID (set via TF_VAR_account_id; not a secret, but kept out of the repo)."
  type        = string
}

variable "zone_name" {
  description = "DNS zone that hosts the app."
  type        = string
  default     = "jpatrickbeal.com"
}

variable "app_name" {
  description = "Base name for Pages projects and hostnames. Staging appends -staging."
  type        = string
  default     = "notepractice"
}
