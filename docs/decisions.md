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
