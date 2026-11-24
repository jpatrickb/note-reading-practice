# Contributing

How we work on this project. If something here changes, also log it in
[docs/decisions.md](docs/decisions.md).

## This is a public repo

Assume everything you commit is public forever.

- **No secrets** in the repo: API tokens, account IDs that grant access, `.env` files. Secrets live in
  GitHub Actions secrets or a local untracked `.env`.
- **No student data**: no names, no progress dumps from real kids, not even in tests or screenshots.
  Use made-up fixtures.
- Third-party assets must have compatible licenses, recorded in `licenses/`.

## Branching

```
main      ●───────────────●─────────●──────   production  (every merge deploys + gets a vX.Y.Z tag)
           \             / \       /
release/    \       ●───●   \     /
             \     /         hotfix/x
develop   ●───●───●───●───●───●───●──────────  staging     (every merge deploys to staging)
               \     /
feature/x       ●───●
```

| Branch | From | PR into | Purpose |
|---|---|---|---|
| `feature/<short-name>` | `develop` | `develop` | All normal work. Verify on staging after merge. |
| `release/<x.y.z>` | `develop` | `main` | Cut when staging is good. Only release fixes go here. |
| `hotfix/<short-name>` | `main` | `main` | Urgent production fixes. |

After any merge into `main` (release or hotfix), **merge `main` back into `develop`** so `develop`
never loses a fix.

Versions follow semver (`vX.Y.Z`) and are tagged on `main`.

> **Prototype phase exception:** until CI/CD exists, we commit directly to `develop`.

## Commits

Brief, simple and clear. An imperative subject line (≤ 72 chars), plus an optional body explaining
*why* when it isn't obvious.

```
Add letter-math drill
Fix bass clef ledger line spacing on iPad
```

## Tests

The user experience is the product, so we test both the logic and the experience.

- **Unit tests (Vitest):** all logic: music theory helpers, the adaptive engine, scoring, persistence
  and encoding. These must be deterministic (inject the clock and the random source).
- **End-to-end tests (Playwright):** real user flows in **Chromium and WebKit** (WebKit stands in for
  iPad Safari), including an iPad-sized viewport with touch.
- Every feature or fix PR includes tests. Bugs get a test that reproduces them first.
- **Coverage:** enforced thresholds in CI (see `vitest.config.ts`). The engine and core logic are held
  to a higher bar than UI glue.

```bash
npm test            # unit tests
npm run test:cov    # unit tests + coverage report
npm run test:e2e    # end-to-end (builds and serves the app)
npm run check       # typecheck + lint
```

## CI/CD (GitHub Actions)

Principle: **thorough, but never wasteful or redundant.**

| Trigger | What runs |
|---|---|
| PR → `develop` or `main` | One pipeline: install (cached) → typecheck/lint → unit + coverage → build → e2e (Chromium + WebKit). Terraform `fmt`/`validate`/`plan` **only if `infra/**` changed**. |
| Merge → `develop` | Build → `terraform apply` (staging, if infra changed) → deploy to **staging** → a short smoke e2e against the deployed URL. The full suite already ran on the PR, so it isn't repeated. |
| Merge → `main` | Build → apply (prod, if infra changed) → deploy to **production** → smoke e2e → tag release. |

Rules that keep it lean:

- `concurrency` with `cancel-in-progress` on PR workflows, so a new push cancels the stale run.
- Path filters: docs-only changes skip build and tests. Infra jobs run only when `infra/**` changes.
- Cache npm and Playwright browsers.
- Pin third-party actions to commit SHAs (supply-chain safety in a public repo).
- Fork PRs use `pull_request` (never `pull_request_target`), so secrets are never exposed to forks.

## Infrastructure

- **Terraform** for all infrastructure (`infra/`). Nothing gets clicked together by hand in a dashboard.
- **Cloudflare** hosting, targeting the **free tier ($0)**: Pages for the static app; later, a Worker
  plus KV/D1 for optional sync.
- **Hostnames:** `notepractice.jpatrickbeal.com` (production) and `notepractice-staging.jpatrickbeal.com`
  (staging). DNS is on Cloudflare.
- **Terraform state** lives in a Cloudflare R2 bucket (S3-compatible backend).
- CI authenticates with a minimally scoped Cloudflare API token stored as a GitHub secret.

## Local development

```bash
npm install
npm run dev          # local dev server
npm run tunnel       # HTTPS tunnel for testing on a real iPad (needs cloudflared)
```
