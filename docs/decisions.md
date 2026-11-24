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
