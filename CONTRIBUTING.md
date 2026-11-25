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

**Branch protection** (`develop` and `main`, admins included): changes land only through PRs, and the
`ci-ok` check must pass with the branch up to date. No approvals are required while the team is one
person. No force pushes or deletions.

### Releasing

1. `git checkout -b release/x.y.z develop`, then bump `version` in `package.json` to `x.y.z`.
2. PR `release/x.y.z` → `main`. CI runs; merge when green.
3. The deploy workflow ships to production and tags `vx.y.z`.
4. PR `main` → `develop` to bring the version bump (and any release fixes) back.

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
npm run test:e2e    # end-to-end (builds and serves the app; E2E_PORT=4174 to run several at once)
npm run check       # typecheck + lint
```

## Adding a game mode

A mode is its own files plus single-line registrations. The app (home chooser, play start, toasts,
summary, My progress, save/load, debug) never names a mode, so nothing else changes.

1. **Core** (`src/core/<mode>.ts`): an `ItemSet` plus `createEngine` (see `letters.ts`). `set.id` must
   equal the mode id; it is also the storage key suffix. Then add one line to `CORE_MODES` in
   `src/core/modes.ts` with the next unused **permanent** tag (it is written into every progress
   code; never reuse or renumber). Item lists are append-only (canonical order, see `itemset.ts`).
2. **Guardrails**: add one `CASES` line in `tests/guardrails.test.ts` (it fails until you do).
3. **UI** (`src/ui/<mode>.ts`): `export const myMode = defineMode<AnswerType>({ id, title, icon,
   blurb, group, core: coreMode('<id>'), words, createPlay, renderMap })`.
   - `blurb`: 8 words at most; `group`: one of the home headings in `MODE_GROUPS` (`src/ui/mode.ts`).
   - `createPlay(host, env)` builds a `PlayShell` (prompt, input, feedback); `env.synth` is the synth.
   - `lanes: 'clefs'` shows the clef picker; `availability(profile)` locks the mode with a friendly
     reason (it is shown, never hidden); `session` adds a misconception detector.
   - `icon` is a built-in `IconName` or a function returning your own inline SVG.
4. **Register**: one import and one entry in `MODES` (`src/ui/modes.ts`).
5. **Check**: `tests/mode-registry.test.ts` covers every registered mode (blurb length, hooks, labels,
   maps, tags, ids). Add the mode's own unit and e2e tests; run `npm run check` and `npm test`.

Kids choose **what** to practice, never difficulty; rewards are for new mastery only (decisions D12,
D14). The shared engine and play shell already enforce this, so a mode must not add its own scoring.

## CI/CD (GitHub Actions)

Principle: **thorough, but never wasteful or redundant.**

Workflows: [`ci.yml`](.github/workflows/ci.yml) (PRs) and [`deploy.yml`](.github/workflows/deploy.yml)
(merges). Setup of the Cloudflare credentials they use: [infra/README.md](infra/README.md).

| Trigger | What runs |
|---|---|
| PR → `develop` or `main` | One pipeline: install (cached) → typecheck/lint → unit + coverage → build → e2e (Chromium + WebKit). Terraform `fmt`/`validate`/`plan` **only if `infra/**` changed**. |
| Merge → `develop` | `terraform apply` (staging; a no-op if nothing changed) → build → deploy to **staging** → `@smoke` e2e against the live URL. The full suite already ran on the PR, so it isn't repeated. |
| Merge → `main` | Same, for **production**, then tag `v<package.json version>`. |

Rules that keep it lean:

- `concurrency` with `cancel-in-progress` on PR workflows, so a new push cancels the stale run.
- Path filters: docs-only changes skip build and tests. Infra jobs run only when `infra/**` (or a
  workflow) changes. Skipped jobs still report through the always-running `ci-ok` job, so required
  checks never hang.
- Dependabot opens weekly *grouped* update PRs (actions, npm, Terraform provider) into `develop`.
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
