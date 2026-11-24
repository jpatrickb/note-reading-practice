# Infrastructure

Terraform for hosting on Cloudflare (free tier). One root module, applied once per environment:

| Environment | Branch | Pages project | URL | State key |
|---|---|---|---|---|
| staging | `develop` | `notepractice-staging` | https://notepractice-staging.jpatrickbeal.com | `staging.tfstate` |
| production | `main` | `notepractice` | https://notepractice.jpatrickbeal.com | `production.tfstate` |

Each environment has: a Pages project (direct upload; GitHub Actions deploys with wrangler), its custom
domain, and a proxied CNAME in the `jpatrickbeal.com` zone. State is stored in the R2 bucket
`notepractice-tfstate` through Terraform's S3 backend, with native lock files.

CI applies this automatically (`.github/workflows/deploy.yml`). You shouldn't need to run it by hand.

## One-time setup (repo owner)

### 1. R2 bucket for Terraform state

Cloudflare dashboard → **R2 Object Storage** → **Create bucket** → name `notepractice-tfstate`, location
Automatic. (R2 needs a payment method on file even on the free tier. State files are a few KB, far
inside the free 10 GB.)

### 2. R2 S3 credentials (Terraform state access)

R2 → **Manage API tokens** → **Create Account API token**:

- Permissions: **Object Read & Write**
- Specify bucket(s): **only `notepractice-tfstate`**
- TTL: forever (or rotate on a schedule you like)

This shows an **Access Key ID** and a **Secret Access Key** once.

### 3. Cloudflare API token (Terraform + deploys)

My Profile → **API Tokens** → **Create Token** → **Custom token**:

| Type | Permission | Access |
|---|---|---|
| Account | Cloudflare Pages | Edit |
| Zone | DNS | Edit |
| Zone | Zone | Read |

- Account Resources: Include → *your account*
- Zone Resources: Include → Specific zone → **jpatrickbeal.com**
- (Optional) Client IP filtering: leave empty. GitHub runner IPs vary.

### 4. Store them in GitHub

Run these **in your own terminal**. Each prompts for the value without echoing it, so secrets never
land in shell history or a chat log:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set R2_ACCESS_KEY_ID
gh secret set R2_SECRET_ACCESS_KEY
gh variable set CLOUDFLARE_ACCOUNT_ID --body "<account id>"   # dashboard → any zone → right sidebar
```

The account ID is a *variable*, not a secret: Cloudflare doesn't treat it as sensitive, and it's
needed to build the R2 endpoint URL.

## Running locally (optional)

```bash
cd infra
export CLOUDFLARE_API_TOKEN=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…
export TF_VAR_account_id=<account id>
export AWS_ENDPOINT_URL_S3=https://$TF_VAR_account_id.r2.cloudflarestorage.com
terraform init -backend-config=backend.hcl -backend-config="key=staging.tfstate"
terraform plan -var environment=staging
```

Use `-reconfigure` when switching between `staging.tfstate` and `production.tfstate`.
