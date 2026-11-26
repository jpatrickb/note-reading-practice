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

### 2026-11-25: Phase 1 build loop (PRs #55–#61)

**Faster pacing (PR #55)**

**D60. Fast track: shortcuts need a run of correct answers.** First-try credit needs 2 right in a row first (1 for Name It), and cascades need 4.
*Why:* a guess is right 1 time in 7, so a run is cheap for a kid who knows the material and practically impossible for a guesser. That keeps D10 (no guess detection, no speed limits) intact.

**D61. First-try credit:** a fluent correct first answer during a run sets recall 0.9 and stability 72 h, and counts as solid after one sighting.
*Why:* knowing an item before it is ever taught is strong evidence of long-term knowledge. Requiring two sightings each was most of the early grind.

**D62. Transfer within a Letter Math rung; ace two and the rest of the rung opens.** Siblings count at `min(recall, lifetime accuracy)`, transfer only raises an estimate, and there is no transfer across rungs or between Name It notes.
*Why:* items of a rung are the same skill. Cross-rung transfer (next letter to 2nds) overloaded the kid who knows steps but not interval names, so each rung tests out on its own, which is still quick for 2nds and 3rds.

**D63. A correct answer after a break never counts for less than with no break.**
*Why:* the old update ran on the decayed estimate, so a kid who was always right could sit below the unlock bar indefinitely. Forgetting still drives selection, dusty display and the size of a miss.

**D64. Unlock check (amends D34): weak = struggling on the last evidence (< 0.7) or dusty (< 0.6 with time). At most 2 weak items, plus the 1-per-8 rule.** An open item counts as solid after `minSeen` = 2 answers, or after one if it earned first-try credit (D61).
*Why:* "haven't checked in a day" isn't "piled-up weak". The old rule made the review load grow with the open set. The cap of 2 keeps a large set from carrying many struggling items.

**D65. While cruising, ask brand-new unvouched items first.**
*Why:* they're what holds up the next unlock. It extends D34's "cruising → harder items".

**D66. Silver after 2 correct answers if the item was never missed (amends D27's "≥ 3 correct"), with a run of at least 3 correct in that lane.** Recall >= 0.85 and fluency are still required. The run counts this answer and lives in `state.runs`, which persists across days. After any miss or "?", or without that run, silver takes 3 as before. Strict pacing keeps 3.
*Why:* the fast track spreads a good session over many new items, so a kid who aced everything earned almost no silver in session 1. Two fluent answers in a row with no miss is reliable evidence, and a guesser manages it only rarely. Gold still requires a later day, so retention is still protected.

**Known and accepted (PR #55):** a random guesser can occasionally unlock a Name It note via a lucky streak (2 in 4,000 simulated runs); unlocking adds practice, not reward.

**Accidentals model (PR #56)**

**D67. Accidental ids are `<Letter><#|##|b|bb><octave>`, and naturals never carry an `acc` key.**
*Why:* existing ids (`C4`) and stored progress stay byte-for-byte identical; ASCII ids are safe in progress codes, URLs and CSS selectors.

**D68. Kid text uses real symbols (`displayName`: F♯, B♭, F𝄪, B𝄫); screen readers get words (`spokenName`: "F sharp").**
*Why:* kids should see the symbols they'll see in real music, and screen readers say "#" and "♭" badly.

**D69. `spellings()` lists single accidentals by default and doubles only on request, ordered natural → ♯ → ♭ → 𝄪 → 𝄫.**
*Why:* the enharmonic rung (C♯ = D♭, E♯ = F) needs single accidentals. Doubles are rarer, so they're opt-in for later key-signature or chord-spelling content.

**D70. The accidental is drawn in the note's own color (shares `.staff__note`).**
*Why:* it's part of the note being read, so it should follow correct/wrong/reveal feedback. This also needs no CSS change, so it doesn't collide with the worlds restyle.

**D71. `parseAnswerName` accepts ASCII (`F#`, `Bb`) and Unicode (`F♯`, `B♭`, `𝄪`, `𝄫`, `♮`), letter case-insensitive.**
*Why:* laptop typing (#33) and on-screen buttons can both feed one parser.

**On-screen piano (PR #57)**

**D72. Piano input fires on `pointerdown`, and the click that follows a release is swallowed (600ms window from pointerup).** Enter and Space are handled on `keydown` (auto-repeat ignored), and bare assistive-tech clicks still press.
*Why:* it responds instantly on iPad and gives exactly one press per pointer, however long the key is held, because the click always arrives right after the release. A `pointercancel` opens no window. Keyboard presses bypass the click path, so a pending swallow can never eat them. VoiceOver and switch access only send clicks, so clicks can't simply be ignored.

**D73. While one pointer is down, other pointers are ignored (no chords).**
*Why:* no planned mode needs chords. A palm or second finger shouldn't count as an answer.

**D74. The piano may grow wider than a narrow container, up to the viewport minus 32px, to keep white keys ≥ 44px.**
*Why:* the 960px app column leaves 42px per key for 3 octaves, below our touch-target rule. Breaking out of the column, centered, is less invasive than widening `#app` for every screen. Phones and portrait iPads can't fit 22 keys at 44px, so modes there need smaller ranges.

**D75. Disabled keys use `aria-disabled` and stay focusable, rather than the `disabled` attribute.**
*Why:* focus isn't lost when a mode disables input between questions, and screen readers still announce the keys.

**D76. One tab stop with roving tabindex; arrow keys move by semitone in pitch order.**
*Why:* 49 Tab stops would be unusable, and pitch order matches what a player expects on a piano.

**D77. Mark icons: ✓ right, ✗ wrong, ◎ target, ★ found, ◇ hint (dashed ring, key keeps its own color). The mark is also spoken in the aria-label.**
*Why:* D53 says color alone is never the cue. A hint keeps the key's color so it nudges without looking like the answer. Marks never add letters, so `labels: 'none'` stays answer-free.

**D78. The piano's color pairs are checked in `PIANO_CHECKS` (`tests/piano.test.ts`) for now.** The focus ring uses a per-fill `--ring` color because the existing `reveal` token is too light against `keyWhite` in Space.
*Why:* this avoids a merge conflict on `themes.ts` while still gating every theme. Follow-up: move them into `CONTRAST_CHECKS` after the feature/worlds work lands.

**Progress code v3 (PR #59)**

**D79. Progress code v3 is the only format written. It supersedes D58's "write v1 until Letter Math is played".**
*Why:* old cached builds that receive a v3 code show the friendly "different version" message, and the service worker updates them on their next launch. Keeping v1/v2 writers would mean maintaining two encoders and would keep the 9-byte records that blow the QR budget.

**D80. v3 records are 5-byte bit-packed quantized fields. Counts (n, c) are capped at 15 in codes; nothing kid- or teacher-facing may use c/n from imported codes — teacher statistics come from sync.**
*Why:* this keeps the QR scannable iPad-to-iPad (≤ 1,200 characters fully played) while the engine's behavior is unchanged. Level, unlocking and silver/gold inputs come out identical, and recall stays within ±0.04. The engine only needs n ≥ 2 and c ≥ 3.

**D81. v3 ends with a CRC-8 after the CRC-16. Later versions must keep that last byte.**
*Why:* builds from before v3 check a trailing CRC-8 before they read the version byte. Without it they would tell a kid "typo" instead of "different version".

**D82. Fully played code budget: 1,200 characters, enforced by a unit test over CORE_MODES.**
*Why:* scan reliability between two iPads. Faster pacing (#55) fills profiles sooner.

**Staff tap input (PR #61)**

**D83. Placing a note is press, slide, lift: a ghost shows on press, sliding moves it, lifting commits.**
*Why:* committing on lift turns precision into a visible, correctable choice instead of a one-shot guess. A 6-year-old who lands on the wrong line sees it and slides before letting go.

**D84. Sliding off the staff, or a system `pointercancel`, cancels without answering. Esc does the same for the keyboard.**
*Why:* a kid who changes their mind needs a way out that isn't a wrong answer. Asymmetric scoring (D10) makes an accidental wrong answer costly.

**D85. Only the lift answers, and input locks after `onAnswer` until `reset()`.**
*Why:* one input per tap, whatever the hold length, device or follow-up click. Locking means the mode never has to guard against a second answer while it shows feedback.

**D86. The staff is a single `role="slider"` Tab stop whose value text is the position ("2nd line"), never the note name. The hit bands' `data-note` lives only inside the `aria-hidden` SVG.**
*Why:* Place It asks for a name, so announcing names would give the answer away. A test checks that no note letter is announced before `reveal()`.

**D87. Snapping and placement logic live in `src/core/staffTap.ts` (pure and coverage-gated). The DOM component lives in `src/render/staffInput.ts`.**
*Why:* the logic that decides answers gets the core coverage bar. The DOM glue stays thin.

**D88. The color pairs used here are checked in `tests/staff-input.test.ts` for now.** They move into `CONTRAST_CHECKS` once feature/worlds lands.
*Why:* this avoids a merge conflict on `themes.ts` while still gating every theme.

**D89. Line and space bands are ~22px tall (min 16px), a deliberate exception to the 44px touch-target rule.** Re-check on a real iPad with a 5–6-year-old; no physical device test has been done.
*Why:* lines and spaces are 9px apart on a real staff, so 44px per position would make the staff more than 600px tall. The ghost preview, the gutter pips and the 36px slide-off slack are what make the smaller bands workable.

**D90. `data-note` (the note name) ships in the production DOM**, on the hit bands inside the `aria-hidden` SVG, so e2e can find positions.
*Why:* screen readers don't read it, but anyone inspecting the page can see the answer. That is acceptable for a kids' app.

**Illustrated worlds (PR #58)**

**D91. Each theme is an illustrated world: an inline-SVG ground strip plus a few separate sprites, and one mascot drawn on a shared face rig.**
*Why:* the owner asked for something more engaging than a colored screen. Inline SVG keeps the art original, offline and small (about 20 KB gz in total), and themeable.

**D92. Celebration size follows real progress.** A correct answer gets a small burst under 700 ms; only new silver/gold gets confetti, the flying key and a cheer.
*Why:* D12 and D14. The big moments must mean "you learned something", and nothing can be farmed.

**D93. Wrong and "?" get no particles and a shorter, gentler mascot reaction than a correct answer.**
*Why:* if a miss were more fun than a right answer, kids would miss on purpose.

**D94. Nothing moves over or behind the staff while a question is up.** Sky sprites pause, ground sprites move only when clear of the staff, and leftover particles are cleared.
*Why:* the seductive-details effect. Motion belongs to feedback and reward moments.

**D95. Calm mode is a setting that the OS reduced-motion preference also forces on.** It removes ambient motion, particles, the flying key and the journey and switch slides, but keeps the mascot's expressions.
*Why:* some kids and teachers need less motion, and the feedback should still be understandable.

**D96. The selected control uses its own token (`selected`) and must reach 3:1 against unselected ones and against the card.**
*Why:* the old Space segment was nearly invisible. A rule in the contrast gate keeps any new theme from repeating that.

### 2026-11-26: Phase 1 build loop, batch 2 (PRs #64–#85)

**Play shell (PR #64)**

**D97. Turn-based, one-outcome-per-question modes go through `PlayShell`; a new mode is a `PlayMode` object, not a new flow.** Real-time (Note Catcher timeouts) and multi-pick (Find All) modes may extend it with hooks.
*Why:* the answer and advance guardrails (D11, D15, D30, D35) are enforced in one place for every mode that fits, so they can't drift.

**D98. The shell, not the mode, appends "Got it →" and decides auto-advance vs. wait.**
*Why:* a mode can't auto-advance a wrong answer or skip the explanation. It only picks the correct-answer delay (`correctMs`); silver and gold always get 1600 ms.

**D99. The shell is generic over the answer type; correctness comes only from `engine.grade`.** `AnswerInput<A>` takes item ids and has an optional `dispose()`.
*Why:* Place It, accidentals, Word Decoder and Find All need non-letter answers, partial key entry and listener cleanup.

**D100. `AnswerInput` is the seam for answer UIs** (`setEnabled`, `markRight`, `markWrong`, `fromKey`).
*Why:* accidentals and Word Decoder can swap the pad without touching the flow.

**Engine: generic answers (PR #65)**

**D101. The engine is generic over the answer type; Name It and Letter Math stay letters.** An item's `answerOf` is both its teaching answer and its answer key; `isCorrect` is optional and only for modes with several valid answers.
*Why:* one engine keeps need-based selection, asymmetric scoring and reward tiers (D55) for every answer type, and `answerOf` as the key keeps D33's rule meaningful for all of them.

**D102. Canonical (progress-code) order is declared separately from teaching order, per item set, and is append-only.** `defineItemSet` throws if it isn't exactly the set's items, and `tests/canonical-order.test.ts` pins every index. This supersedes D31's "append to the flattened lanes" convention.
*Why:* appending to the lanes would shift every bass index and silently corrupt saved codes. An explicit order makes a missing append fail loudly at load time, and teaching order can be edited without touching saved progress.

**D103. Every mode must pass the shared guardrail suite (`tests/guardrails.test.ts`) before it ships.** A random guesser unlocks nothing and stays below 50% recall; a button-masher unlocks nothing; "?" costs less than a miss; the first three open items in a lane have different answers; picks go through `engine.selectItem`; replaying mastered material earns nothing.
*Why:* the guardrails (D10, D12, D33, D34) belong to both the engine and the content, so each mode has to prove them in one place.

**D104. Modes should offer at least 5 answers, or add content-level protection.** The suite allows one lucky silver for the 3-answer test mode and none for letter modes.
*Why:* with 3 answers a random guesser stumbled into a silver in 2 of 5 runs of 600 guesses (0 of 5 for 7 letters). A 2-answer mode like step/skip would be easy to game with this engine as tuned.

**D105. The pre-#18 lockstep reference (`tests/reference/`) is temporary.** Whoever next changes the learner model on purpose deletes it and `tests/lockstep.test.ts`. The golden order test is permanent.
*Why:* the lockstep test proves a refactor changed nothing; afterwards it would only block intended tuning.

**Audio (PR #66)**

**D106. Sequences are scheduled on the audio clock with a 0.2 s look-ahead and a 25 ms timer.**
*Why:* setTimeout-based playback drifts and stutters when the main thread is busy (rendering SVG, particles); the audio clock doesn't.

**D107. `stopAll()` is called when a screen closes, and muting calls it too.**
*Why:* a tune must never keep playing after the kid leaves the screen or turns sound off. Wiring it into each screen is a one-line follow-up in `app.ts`.

**D108. Polyphony cap of 16; melody outranks chord, which outranks bass, when voices are stolen.**
*Why:* old iPads stutter with too many oscillators, and losing accompaniment is far less noticeable than losing the tune.

**D109. Chord and bass voices use fewer, rounder partials, a slower attack, a darker filter and lower levels.**
*Why:* accompaniment must support the melody, not compete with it.

**D110. The silent-switch fix is a generated silent WAV looped in an `<audio>` element, started in the unlock gesture and paused while muted.** Not yet checked on a real iPhone.
*Why:* iOS routes media elements through the playback channel, which ignores the ring/silent switch. Generating the clip avoids a binary asset and a precache entry, and D4 (sound always on) is what makes the switch matter.

**Multi-note staff (PR #67)**

**D111. Long phrases scroll, they don't wrap, and are never drawn below 1.8 CSS px per unit.** Past `maxWidth` the SVG sets `data-scroll` inside a focusable, labelled region.
*Why:* wrapping needs a clef per system and breaks stable `data-index` and cursor tracking. Kids follow one line.

**D112. Without `beats`, events are whole notes with no stems.**
*Why:* this matches the Name It look; stems and values appear only when a mode asks for them.

**D113. Note names reach the DOM only after answering.** The group label is "note 3 of 6" until the event is answered, and the SVG label never lists notes. Visible labels are drawn only for events the caller names.
*Why:* the answer must not leak to screen readers or DOM text.

**D114. Stem rule: down from the middle line up; chords use the average of the extreme notes; stems are 3.5 spaces and reach at least the middle line.** Accidentals in chords go into columns top, then bottom, then middle when they would sit under 6 positions apart.
*Why:* standard engraving, so what kids see matches printed music.

**D115. Right and wrong are marked with ✓ and ✗ above the event as well as by color.**
*Why:* D53 says color alone is never the cue.

**D116. The cursor is a tinted box (16% `--primary`) with an outline, and has no animation.**
*Why:* it is visible without relying on color, and there is nothing to gate on reduced motion. A per-theme test checks it against ink, line, right, wrong and reveal.

**Ledger lines (PR #71)**

**D117. A hint counts only from a guide note taught at or before the note.**
*Why:* a hint must never point at a landmark the kid hasn't met.

**D118. High C and Low C are taught first among the far notes** (treble C6 B5 A3 B3; bass D4 E4 C2 D2), with no letter repeated back to back.
*Why:* the guide notes anchor the hints for their neighbours (D33).

**D119. New ledger notes are appended to `CANONICAL_ORDER` at 26–33.**
*Why:* D102 is append-only, so old codes decode unchanged.

**D120. Hint text for all items is pinned by a table test.**
*Why:* a hint change should be deliberate.

**Placement core (PR #73)**

**D121. Placement is a binary search with 2 correct answers per level and spot checks, and takes at most 15 answers.**
*Why:* two right per level makes a lucky guess 1 in 49 per level, and three spot checks below the frontier make a lucky placement about 1 in a few thousand, with no guess detector needed (D10).

**D122. Placement answers are evidence, not play: no run, no first-try credit, no unlock, no silver, gold or polish.**
*Why:* this keeps D12 (rewards only for new mastery in play) and stops the fast track from counting the same answers twice (D101–D105).

**D123. Placed items start at recall 0.75 and unseen, so they stay weak until answered.**
*Why:* a wrong placement is corrected by the normal need-weighted engine within a session, and a right one is confirmed just as fast by first-try credit.

**D124. Placement runs only on a fresh lane, and needs an answer space of at least 5.**
*Why:* it is a start, not a way to reset progress, so it can't farm or wipe anything. A 3-answer mode would make a lucky level 1 about 1 in 9 (D104).

**D125. Placement answers count as practice days and feed `confusions` and `recentErrors` for the items that open.** Answers on items that stay locked above the final open set are not recorded.
*Why:* a placement day is real practice. Locked items keep their intro and transfer prior, which is the simplest option.

**D126. Errors are asymmetric on purpose: under-placement is cheap, over-placement is not.**
*Why:* the fast track climbs quickly from too low, while too high puts struggling items in front of a kid.

**Compact progress codes (PR #74)**

**D127. Compact-gold layout is signalled per section by `recordLen = 0` plus a layout byte, and is written only for sections that contain a gold item.**
*Why:* the decoder already rejects `recordLen < 5` as "different version", so no layout change is ever silent. Sections without gold stay byte-identical.

**D128. Gold records keep m, s, hours since last answer, and n/c, and drop rt and silverDay (decoded as 0 and -1).**
*Why:* the engine never reads rt or silverDay for a gold item, while n and c still feed the transfer prior. Teacher statistics come from sync (D80).

**D129. The QR carries `#import32=` with uppercase base32 as a two-segment (byte + alphanumeric) code. `#import=` base64 links and text codes stay valid.**
*Why:* `#` and `=` aren't QR alphanumeric characters, so the URL stays readable to phone cameras, and a distinct key avoids guessing the encoding.

**D130. Tests keep a frozen copy of the previous codec (`tests/fixtures/codec-v3-frozen.ts`) and golden v3 fixtures. The frozen copy is never edited.**
*Why:* "an old decoder says different version" and "the new codec matches the old one" can only be shown against the real old code.

**D131. From this build on, unknown `#import<key>=` keys say "different version".** Builds from before this change ignore `#import32=` and land on the home screen, silently when offline.
*Why:* when online, the service worker update reloads the app at launch and keeps the fragment, so the new build opens the import screen. This is a known gap until then.

**Mode registry (PR #76)**

**D132. A mode is one `defineMode` file plus one line in `src/ui/modes.ts` (and one permanent `CORE_MODES` entry); the app never names a mode.**
*Why:* parallel modes touch only their own files, and nothing in the app can drift from the mode list.

**D133. The home screen lists modes as cards under fixed group headings. A locked mode is shown with a friendly reason, never hidden, and can't be selected.** The chosen card is marked by a check and outline as well as color.
*Why:* kids should see what is coming and what unlocks it (D12), and D53 says color is never the only cue.

**D134. Choosing a mode or clef redraws only the practice card, and the Start row is sticky.**
*Why:* with about ten modes the list scrolls, and picking a card must not jump the page or hide Start.

**D135. `Settings.mode` is any registered mode id (unknown falls back to Name It); `Settings.lanes` stores each mode's clef choice, with `clefs` kept as the last choice and default.**
*Why:* old settings keep working, and a mode registered later never breaks a saved one.

**D136. `normalize()` repairs rather than rejects.** Missing or malformed fields take the fresh learner's value, sound fields are untouched, and unknown items and fields are kept. A save with items but no `version` is treated as version 1.
*Why:* a kid's progress must never brick the app, whether from an older build, a partial write or a hand edit (#72).

**D137. Only the active mode's state is written after an answer. My progress shows only modes with progress; the home pill and weekly goal count every mode (extends D59).**
*Why:* ten modes would otherwise rewrite ten learner models on every tap, and an empty map for an unplayed mode is noise.

**D138. A test-only locked mode exists behind `?debug`.**
*Why:* the locked state needs an end-to-end test before any real mode is locked.

**Per-mode import (PR #80)**

**D139. Import is per mode, by the sections present in the code.**
*Why:* older codes and codes from kids who never played a mode have no section. Treating a missing section as "reset" would silently destroy progress.

**D140. Practice days are unioned per replaced mode (capped at 21), not replaced.**
*Why:* the weekly goal is device-wide, and a code must never lower it.

**D141. A mode with a section replaces the device's learner model wholesale instead of merging items.**
*Why:* merging item by item would mix two learner models and make the code stop meaning what it says.

**Place It (PR #82)**

**D142. Place It's answer is the staff position, and the wrong octave is wrong.**
*Why:* it's the only reading that tests octave placement. Kids need "the one an octave higher" feedback, not a free pass.

**D143. When a clef offers several of a letter, the prompt says "the lower/higher G" (lowest, middle, highest for three).** The count runs over the whole item list so the wording is stable.
*Why:* otherwise a right placement can be marked wrong for an ambiguous question.

**D144. The question is silent; the pitch plays with the answer.**
*Why:* sound at question time would let a kid with a good ear skip reading. D3 and D4 still hold, since every answer sounds.

**D145. Place It ships 12 notes per clef (24 items), derived from Name It's order.**
*Why:* this keeps the progress code small and hint anchoring in step with Name It.

**D146. Place It owns its canonical order (`place:` ids), tag 3.**
*Why:* it is independent of Name It's list, so editing one never moves indices in the other.

**Placement UI (PR #83)**

**D147. Placement is offered on the first Start of a fresh lane only, as two equal choices, neither focused.**
*Why:* D12 (kids choose what to practice), and "offered, not forced": a kid who wants to begin at the beginning is never nudged.

**D148. During placement every answer gets the same neutral "Thanks!"** There are no right or wrong marks, no teaching and no medals. The ask-time note still plays (D4).
*Why:* answers are evidence, not play. Showing a miss would turn a warm-up into a test.

**D149. With several clefs chosen, only the first fresh lane is placed.**
*Why:* 15 answers per lane would stretch a one-minute warm-up. The other lane starts at the beginning, which errs toward placing low.

**D150. Quitting mid-round discards it; nothing is saved and the offer returns.**
*Why:* a partial round is weak evidence, and a kid who stops isn't asking to be placed.

**D151. The result line is mode-owned (`placedLine`) and never shows a score.**
*Why:* a number would turn placement into a grade. A starting place is all the kid needs.

**Note Catcher (PR #78)**

**D152. Key names aren't spoken while a question is open.** Each key's accessible name is its place ("Piano key 5 of 17"); keys are named again after the answer.
*Why:* the letter-to-key mapping is what this mode teaches, and a spoken name per key would turn it into Name It for a screen reader user.

**D153. Nothing sounds when a question appears.** The pressed key sounds, and after a miss or "?" the right key sounds too.
*Why:* the pitch of the shown note would let a kid hunt for the key by ear. D4 still holds, since every note answered plays.

**D154. Narrow screens show a window of as many white keys as fit at 44px or more (at least 6), at a random offset. Wide screens show the whole range.**
*Why:* keys stay at least 44px at every supported width, and the window's position says little about the answer.

**D155. A black key is not an answer.** It shows a gentle tip and isn't scored, so the answer space is white keys only.
*Why:* black keys are never right here and overlap neighbours on small screens, so a mis-tap should cost nothing.

**D156. The piano shows no middle-C dot during a question; it appears with the answer.**
*Why:* a dot on every C4 question would let a kid mark C4 by its absence.

**D157. A mode carries its own mini-lessons (`SessionMode.lessons`).**
*Why:* five modes are adding lessons, and one shared table would conflict every time.

**Word Decoder (PR #79)**

**D158. Any wrong note makes the whole word wrong, and a wrong note can't be undone.**
*Why:* an undo would let a kid retry into the answer, defeating asymmetric scoring (D10). A mis-tap costs one word, and the hint teaches the note.

**D159. A Word Decoder item is a (clef, word) pair with the typed word as its answer, graded per word.** All notes right is correct; any "?" with nothing wrong is "?"; any wrong note is wrong.
*Why:* one engine answer per question keeps the shared shell and session unchanged, and "?" costs less than a miss (D11).

**D160. A word opens only when every letter has a silver Name It note in that clef.** The mode needs 5 silver notes in a clef, covering the starter words. A fresh model with no Name It source opens only the starters.
*Why:* word mastery must not stand in for note reading. Replaying a mastered word earns nothing (D12).

**D161. Notes for a word are drawn fresh each play from the kid's silver Name It notes, in any octave.** Ledger notes appear only once silver there.
*Why:* the picture can't be memorized, and the kid is never shown a note they haven't earned.

**D162. Later letters of a long word partly measure vocabulary (a kid can predict CABBAGE after C-A-B).** Per-note judging, the silver gate, and one silver and one gold per word bound what that can earn.
*Why:* the design can't stop prediction, so the decision records it and the mitigation.

**D163. Word response time is judged per note (`ItemSet.rtUnits`).**
*Why:* a 7-letter word shouldn't look slower than a 3-letter one against the kid's own baseline (D10, D55).

**D164. Word lists are data in `src/core/words.ts`: only A–G, 3 to 7 letters, original and kid-safe, in Name It's teaching order.** The progress-code order is separate and append-only.
*Why:* a teacher can review and edit words without touching logic or moving saved records (D33 variety).

**D165. Word Decoder's registration uses core tag 7.**
*Why:* it is the number the issue reserved, and tags are permanent (D79).

**Owner decisions**

**D166. Code budget: the progress-code budget is 1,800 characters / QR version 29.** It was set from a real two-iPad camera test on 2026-11-25, where QR codes up to 2,200 characters (v32) all scanned. It keeps one step of margin and supersedes D82's 1,200.

**D167. Phase 2: sync goes ahead after the Phase 1 modes (issue #11).** With sync, the QR will carry only a short sync code. The planner's design (Pages Functions + D1) stands, and it needs D1 → Edit on the Cloudflare token.

**D168. Silver rule: corrupted `best` values clamp to the 0–2 range (3 → 2), so a kid never loses a gold key to corrupted data.**
