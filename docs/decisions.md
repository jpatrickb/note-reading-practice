# Decision Log

Append-only. Each entry: date, decision, why. If a decision is reversed, add a new entry; don't edit
the old one.

---

### 2026-11-24: Initial design session

**D1. The objective is long-term musical understanding; enjoyment is a constraint.**
We optimize for retained fluency across staff/name/keyboard/sound, not engagement.
*Why:* games optimized for engagement get gamed and teach little. The goal is better musicians, not
key-pushers.

**D2. Staff → name is the primary skill in v1; keyboard location is second.**
*Why:* names are the vocabulary of theory, sight-reading, and other instruments. It's the teacher's
current focus and the weakest link she sees.

**D3. No perfect-pitch tasks. Ear training always gives a reference pitch.**
*Why:* perfect pitch is rare. Testing it would be unfair even though it's easy for computers.

**D4. Sound is always on.**
*Why:* free ear training; it links symbol to sound on every question.

**D5. Add a Musical Alphabet / Letter Math game.**
*Why:* forward/backward/skip fluency is the foundation of intervals and chords.

**D6. The content ladder includes accidentals and enharmonic equivalents.**
*Why:* naturals are only the start; students need to level up to real music.

**D7. Local-first architecture with a $0 hosting target and no accounts.**
All learning logic runs in the browser. Optional anonymous sync on Cloudflare's free tier, with a
teacher page built on top.
*Why:* minimal barriers for families, no auth to maintain, privacy by default.

**D8. A QR handoff to the teacher is rejected as the teacher-dashboard mechanism.**
*Why:* kids leave their devices at home, so they can't bring a QR code to lessons. The teacher page
relies on optional sync instead. QR/code export stays as a device-transfer and backup tool.

**D9. iPad storage eviction must be mitigated** (Add to Home Screen prompt, `storage.persist()`,
sync/backup).
*Why:* Safari deletes site data after 7 days without a visit, and iPads are expected to be common.

**D10. No guessing detection or speed thresholds.** Use asymmetric scoring so guessing has negative
expected value.
*Why:* we have no data, and heuristics would punish genuinely fast kids. A scoring structure that makes
honest effort the best strategy needs no classifier.

**D11. Add a "?" (I don't know) button.**
*Why:* rewards honesty and gives the model cleaner data than guesses.

**D12. Reward new mastery only, not activity. Kids choose what to practice, not difficulty.**
*Why:* self-selected easy mode then earns nothing new, which closes the exploit without forcing.
Placement replaces the difficulty menu.

**D13. Weekly goals, not daily streaks. No cross-kid leaderboards.**
*Why:* kids don't control their schedules; broken streaks and comparison across levels demotivate.

**D14. Rewards are musical and informational, to avoid the overjustification effect.**
*Why:* many students are made to take piano. The goal is for them to enjoy it.

**D15. Feedback hints combine mnemonics and landmarks.**
*Why:* the teacher uses Faber + mnemonics; landmark thinking adds speed and leads into intervals.

**D16. Real-piano mic detection is parked; MIDI is not a focus.**
*Why:* we can't gather test data on real pianos, pianos can be out of tune with themselves, and we
won't collect audio data from users. MIDI is too niche and unsupported on iPad.

**D17. Multiple kid-selectable visual themes, as a separate lane of work.**
*Why:* ages span ~5–17 with varied tastes.

**D18. Documentation lives in the git repo; decisions are recorded here.**
*Why:* chat sessions are lost and people forget. Undocumented decisions don't exist.

---

### 2026-11-24: Engineering process

**D19. Git flow: `feature/*` → `develop` (staging) → `release/*` → `main` (prod). Hotfixes branch from
`main`, merge into `main`, then `main` is merged back into `develop`.** During the prototype phase we
commit directly to `develop`. See CONTRIBUTING.md.
*Why:* the team's standard flow; staging verification before every release.

**D20. Commits are brief, simple, and clear.** No strict convention.

**D21. Tests: Vitest unit + Playwright e2e (Chromium + WebKit/iPad viewport), with enforced coverage.**
*Why:* the user experience is crucial; WebKit is our proxy for iPad Safari.

**D22. Infrastructure is Terraform; hosting is Cloudflare (free tier); CI/CD is GitHub Actions.**
CI must be thorough but not redundant: the full suite runs on PRs, and post-merge runs only deploy +
smoke tests.

**D23. The repo is public.** No secrets, no student data, licensed third-party assets only.

**D24. Domain: a subdomain of jpatrickbeal.com** (exact names TBD).

**D25. v0 stack: Vite + TypeScript, no UI framework; hand-drawn SVG staff using Bravura glyph outlines
(SIL OFL).**
*Why:* a tiny bundle and fast on old iPads. Custom SVG gives exact hit areas for later modes (Place It)
and easy theming. Bravura is the reference SMuFL font and renders the same everywhere (unlike Unicode
music symbols). We'll revisit a framework if UI complexity grows.

---

### 2026-11-24: Prototype v0 build

**D26. v0 learner model:** a per-item Elo-style recall logit that decays with time
(`logit − log2(1 + hours/stability)`). Stability grows only with *spaced* correct reviews (cramming
barely helps). Step sizes are asymmetric: correct +1.4·(y−p), wrong −2.0·p, "?" −1.0·p. Speed is
judged only against the kid's own baseline (fluency factor ≥ 0.6, never a penalty for fast answers).
Selection targets ~80% predicted success. See `src/core/engine.ts`.
*Why:* simple, explainable, and runs in the browser. Simulations in the unit tests verify that a
random masher earns no mastery and settles around 10% estimated recall, while an honest learner earns
silver in about 4 correct answers per known note.

**D27. Reward tiers:** **silver** = recall estimate ≥ 0.85, ≥ 3 correct, fluent for this kid;
**gold** = still silver on a *later calendar day*; **polish** = a mastered note that had faded
(recall < 0.6) is fresh again. Levels never go down. Faded keys look dim ("needs a polish") instead of
being taken away.
*Why:* gold measures retention, not cramming. Polish rewards spaced review without punishing the kid.

**D28. New notes unlock one at a time** once ≥ 80% of the clef's unlocked notes have been seen at least
twice and have recall ≥ 0.75. Order: guide notes first, then outward by distance from the nearest guide
note.

**D29. Teach before testing:** the first time a note appears, it's introduced ("Meet G!") with its
name and hints before being quizzed.

**D30. Correct answers auto-advance; wrong answers and "?" wait for "Got it".**
*Why:* the kid has to actually see the explanation; there's no extra friction when they're right.

**D31. The progress code omits the confusion matrix and recent errors** (short-term diagnostics).
The item order in `ITEMS` is append-only because the code format depends on it.

**D32. e2e on hosts without Playwright WebKit:** `NO_WEBKIT=1` swaps the iPad project to emulated
iPad (viewport + touch) on Chromium. CI always runs real WebKit.
*Why:* the dev machine (Arch) lacks the Ubuntu libraries Playwright's WebKit build needs.

---

### 2026-11-24: First play-test fixes

Play-test feedback: *"Pacing is too slow at the very beginning, then too fast in the middle, and then
I just got stuck getting the 3 different octaves of C … 18-19 out of 20 questions would be C. Becomes
very easy to game, and very boring."* A simulation reproduced it (18/20 C picks in session 1; bass
notes abandoned at ~0.1 recall). There were three causes, fixed below.

**D33. Hand-written teaching order; the first 7 notes of each clef cover all 7 letters.**
Treble: G4 C4 A4 F4 E4 B4 D4, then C5 D5 E5 F5 G5 A5. Bass: F3 G3 E3 A3 D3 C3 B2, then G2 A2 C4 B3 F2 E2.
Replaces the computed "guide notes first" order.
*Why:* starting from all the guide notes put 4 Cs among 6 starter notes. Since answers are letters,
pressing "C" was right two-thirds of the time. The order lives in `src/core/items.ts` for the teacher
to review.

**D34. Selection weights notes by need (1 − recall); weak notes are never abandoned.** It replaces
"closest to 80% predicted success", which penalized weak notes as much as easy ones and made them
vanish. Additions:
- a success controller (rough patch → lean on known notes; cruising → harder notes);
- the same answer letter twice in a row is discouraged;
- with both clefs, attention is split by clef first, and the weaker clef gets the bigger share.

Unlocking now requires every open note to be solid (seen ≥ 2×, recall ≥ 0.7), allowing 1 weak note per
8 open notes so one stubborn note can't block progress forever.
*Why:* this fixes "too fast in the middle" (new notes used to stack on top of weak ones) and the
abandoned-notes bug. Regression tests cover each failure mode.

**D35. New notes are quizzed first, then taught on "?" or a miss (supersedes D29).**
*Why:* the meet card made the start slow, especially for kids who already know their notes. The
pretesting effect says attempting before seeing the answer helps retention even when the attempt is
wrong, and the "?" button makes not knowing cost little.

### 2026-11-24: Owner decisions

**D36. License: MIT.**

**D37. Hostnames: `notepractice.jpatrickbeal.com` (prod) and `notepractice-staging.jpatrickbeal.com`
(staging).** "musicnotes" was avoided because Musicnotes is an established sheet-music brand.

**D38. Terraform state lives in Cloudflare R2** (S3-compatible backend, free tier).

### 2026-11-24: CI/CD and infrastructure

**D39. Branch protection on `develop` and `main`, enforced for admins:** PRs only, required check
`ci-ok`, the branch must be up to date, 0 required approvals (solo team), no force pushes or deletions.

**D40. One required check, `ci-ok`**, which always runs and fails only if a needed job failed or was
cancelled. Jobs skip by path (docs-only → no tests; infra plan only when `infra/` or workflows change).
*Why:* required checks combined with workflow-level path filters would leave docs-only PRs blocked
forever.

**D41. A separate Pages project per environment** (`notepractice`, `notepractice-staging`), direct
upload via wrangler from Actions (no Cloudflare Git integration). One state file per environment in
R2, with native S3 lock files.
*Why:* each environment has its own custom domain and production deployment, with no reliance on
Pages branch-alias routing. CI stays the only path to deploy.

**D42. Deploys run `terraform apply` every time,** then build → deploy → `@smoke` tests against the
live URL. Production also tags `v<package.json version>`.
*Why:* apply is a cheap no-op when nothing changed, guarantees the project exists, and surfaces drift.
Smoke tests (not the full suite) avoid repeating what the PR already proved.

**D43. Supply chain:** actions are pinned to commit SHAs; Dependabot sends weekly grouped updates to
`develop`; the provider lock file has hashes for Linux, macOS, and Windows; Node is pinned in
`.node-version`.

**D44. Security headers via `public/_headers`** (nosniff, frame deny, referrer policy, permissions
policy denying camera/mic/geolocation). Staging adds `X-Robots-Tag: noindex`.

**D45. Staging's noindex header goes inside the existing `/*` block of `_headers`.** The smoke test
checks headers only our file sets (X-Frame-Options, Permissions-Policy).
*Why:* the first deploy appended a second `/*` block, which silently replaced the first, so our
security headers were dropped. The original smoke test checked `nosniff`, which Pages sends by default,
so it passed without proving anything.

---

### 2026-11-24: Parallel feature work (PRs #4 PWA, #5 Themes, #6 Letter Math)

Built by three engineers in separate git worktrees; decisions are recorded here by the lead at merge.

**Offline & install (PR #4)**

**D46. Hand-written service worker plus a tiny Vite plugin, not vite-plugin-pwa/Workbox.**
*Why:* the app shell is a few files on one route. About 80 readable, unit-tested lines give exact
control of updates with no runtime dependency shipped to iPads.

**D47. New versions never take over mid-session.** There's no automatic `skipWaiting`. An update found
at launch (before any interaction) applies immediately; otherwise a "tap to refresh" banner shows on
the home screen only.
*Why:* a reload mid-question loses the kid's session and feels broken.

**D48. The service worker serves the page cache-first, from the same version as its assets.**
Freshness comes from a content-hashed `sw.js` (`no-cache`, `updateViaCache: 'none'`) and an hourly
update check when an installed iPad app resumes. The page is precached as `./` because Pages redirects
`/index.html`.

**D49. Stay on localStorage; IndexedDB is deferred.**
*Why:* Safari's 7-day eviction and `persist()` treat both the same, so there's no durability gain. The
state is tiny, and the synchronous API keeps boot simple. Revisit for sync/workers.

**D50. The install tip's "Not now" snoozes for 30 days** (never shown once installed). The Save screen
shows how safe the kid's progress is on this device (`persisted()`, iOS, standalone).
*Why:* installing is the main defense against iPad data loss, so a gentle monthly reminder is
justified.

**Themes (PR #5)**

**D51. Theme tokens live in `src/core/themes.ts`.** Every theme must pass the `CONTRAST_CHECKS` unit
gate: AA text 4.5:1, UI parts 3:1, and a ΔE distance between mastery levels.
*Why:* a single source of truth, so a new theme can't ship unreadable.

**D52. Six launch themes, named by mood and never by gender:** Sunny (default), Ocean, Forest, Candy,
Space (dark), Studio (minimal). Only system fonts and CSS-only decoration (no web fonts, images or
dependencies).

**D53. Mastery levels don't rely on color alone:** locked keys are dashed with no letter, and learning
letters get a halo.

**D54. The theme is applied before the first render, and `theme-color` is set at runtime.**
`Settings.theme` is optional; unknown ids fall back to Sunny.

**Letter Math & engine (PR #6)**

**D55. All modes share one engine** (`ItemSet` + `createEngine`). Each mode keeps its own learner model
and speed baseline. Name It's behavior is unchanged.
*Why:* every future mode gets need-based selection, anti-gaming scoring, and the reward tiers for free.
Letter counting is slower than reading a note, so baselines must not mix.

**D56. Letter Math ladder:** next up → next down → skips (C E G B D F A) → intervals, up then down, in
the order 2nds, 3rds, 8ths, 5ths, 4ths, 6ths, 7ths. Interval start letters follow the circle of
fifths. The first open items have varied answers; G→A (the wrap-around) is the 4th item.

**D57. Interval hints count the starting letter as 1 and show the walk.** After each answer, the start
note then the answer note plays (relative pitch, D3/D4).

**D58. Progress code v2 adds a Letter Math section.** v1 is still written until Letter Math has been
played, and v1 codes always decode.

**D59. The weekly goal counts practice in any mode.**
