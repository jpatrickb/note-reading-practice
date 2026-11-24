output "project_name" {
  description = "Pages project to deploy to (wrangler pages deploy --project-name)."
  value       = cloudflare_pages_project.app.name
}

output "url" {
  description = "Public URL of this environment."
  value       = "https://${local.hostname}"
}
