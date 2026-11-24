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
