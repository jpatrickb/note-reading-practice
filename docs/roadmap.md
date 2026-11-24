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

## Phase 1: Core game

- Place It, Note Catcher, Find All, Letter Math, Word Decoder
- Placement round
- Ledger lines, then accidentals and enharmonics
- PWA: offline support, Add to Home Screen prompt, `storage.persist()`
- First themes
- ~~Real hosting on Cloudflare Pages with IaC and CI/CD~~ (built; live once the Cloudflare credentials are set, see `infra/README.md`)

## Phase 2: Sync & teacher page

- Anonymous sync codes on a Cloudflare Worker (KV/D1, free tier)
- Teacher page showing students' progress
- Weekly goals

## Phase 3: Theory & musicianship

- Step or Skip, Snowman Chords, Echo (relative pitch), Melody Boss
- Unlockable songs, compose sandbox
- Key signatures, phrases
