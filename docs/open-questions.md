# Open Questions, Parked Ideas & Risks

## Open questions

- **Sync design:** how is a sync code created and shared with the teacher? How does the teacher page
  find "her" students without accounts (a class code? the teacher enters each kid's sync code)? What
  happens when two devices edit the same progress (merge rules)?
- **Play-test findings:** does v0's pacing feel right (unlock speed, silver after ~4 correct, session
  length 20)? Do kids understand silver/gold/polish?
- **Scoring constants:** the exact asymmetric weights, the mastery thresholds, and the "?" cost. Tune
  with real kids.
- **Mastery definition:** what counts as "mastered" (for example correct and fast across ≥3 separate
  days)?
- **Engine choice:** Elo or Bayesian Knowledge Tracing (or a hybrid) for v0. Start simple.
- **Teacher's method:** confirm Faber's "guide notes" and align the landmark set and hint wording with
  the books she uses.
- **Devices:** survey students' families about iPad vs laptop and acoustic vs digital piano.
- **Theme lane:** how many themes, who designs them, and whether themes are pure skins or also change
  characters and sounds.
- **Accidental input UI:** letter + ♯/♭ buttons, or a 12-key layout? How to ask enharmonic questions
  fairly.
- **Audio on iPhone:** the ring/silent switch mutes Web Audio. Is the HTML-audio unlock trick needed?
  (iPads mostly lack the switch.)

- **Letter Math pacing (important):** with the strict unlock rule, simulations show about 1 new item per
  session. The 126-item ladder would take months, and kids who already know the alphabet would grind.
  Likely fix: a placement round or a per-rung "test out" fast track. Needs a teacher decision.
- **Letter Math 2nds/3rds:** these repeat next-letter/skip answers under interval names (28 items). Keep
  them to teach the names, or drop them?
- **Space theme:** the selected segment on home (mode/clef) is only subtly different from unselected.
  Add a contrast rule for selected vs. unselected controls.
- **Faster first paint:** a small inline script in `index.html` could apply the theme before the bundle
  loads (follow-up from the themes PR).
- **Zone Browser Cache TTL:** the jpatrickbeal.com zone rewrites `/sw.js`'s `no-cache` to 4h.
  Harmless (`updateViaCache: 'none'`), but a hostname-scoped Cache Rule would make headers honest. That
  needs extra token scope, and it's the owner's zone, so it's the owner's call.
- **iPad hand-checks pending:** Add to Home Screen icon/name; offline play in airplane mode; the update
  banner never appears mid-session; whether Safari progress carries over to the installed app
  (believed separate); Share button location wording; Save screen ✅/⚠️.
- **Mixed-persona peak:** under fast pacing, one seed of a kid who knows next-letter/skips but not intervals peaked at 16 open-but-weak items (median ~5). Capping open-unseen items at 7 cut it to 9 but slowed knowers a lot; not adopted. Revisit with real play data.

## Parked

- **Real piano via microphone.** Checking an expected note is easier than identifying an unknown one,
  and octave-agnostic matching helps, but pianos can be out of tune with themselves, there's background
  noise, and we can't test on real pianos or collect user audio. If ever attempted: optional only, and
  it must never mark a kid wrong when unsure (fall back to tapping).
- **MIDI input.** Niche, not supported on iPad Safari.

## Risks

- **iPad 7-day storage eviction:** see design §6. Mitigation required, not optional.
- **Losing progress when switching devices** without sync. Accepted for tier 0; mitigated by the
  progress code and optional sync.
- **Reward design gets gamed** in ways we haven't predicted. Watch real kids play.
