# Roadmap

## Phase 0: Prototype v0 (built 2026-11-24, awaiting play-testing)

A small slice that tests the riskiest ideas, not a polished product. A single static page tested on an
iPad (served over a tunnel during early work).

1. **Name It** drill (staff → name), treble and bass, naturals only. A–G buttons plus typed letters.
   Sound always on. Mnemonic and landmark hints. "?" button.
2. **Adaptive engine** in the browser: per-item mastery with spacing, targeting ~85% success, plus a
   confusion matrix.
3. **Mastery map:** keys turn gold; rewards come only from new mastery.
4. **Local persistence** (localStorage for now; IndexedDB in Phase 1) plus progress-code export/import
   with a QR code.
5. **Debug panel** (adults only, `?debug`) showing the model's estimates, with a time-travel button
   to test next-day gold.

**Next step:** play-test with real kids, then tune the parameters in `PARAMS` (`src/core/engine.ts`).

## Phase 1: Core game (in progress)

Done 2026-11-24: Letter Math; Word Decoder; generic multi-mode engine; 6 themes; installable offline PWA; CI/CD +
Terraform (staging live).

Done 2026-11-26: Place It; Note Catcher; Word Decoder; placement round; mode registry; per-mode import.

Remaining:

- Find All (#28)
- Key to Staff (#29)
- Ledger lines, then accidentals and enharmonics
- ~~Placement / fast track~~ done: fast pacing (#55), placement round (#73, #83)
- First production release (`release/0.1.0`)

## Phase 2: Sync & teacher page

- Anonymous sync codes on a Cloudflare Worker (KV/D1, free tier)
- Teacher page showing students' progress
- Weekly goals

## Phase 3: Theory & musicianship

- Step or Skip, Snowman Chords, Echo (relative pitch), Melody Boss
- Unlockable songs, compose sandbox
- Key signatures, phrases
