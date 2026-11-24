# Note Reading Practice

A web game that helps piano students (ages ~5–17) learn to read music: fluent, automatic links between
**the note on the staff, its name, its key on the piano, and its sound**, building toward intervals,
chords, and real musicianship.

It started as a tool for one piano teacher's ~20 students. Kids practice at home on an iPad or computer
through a website.

## Status

**Phase: prototype v0** (as of 2026-11-24). A playable "Name It" drill (staff → note name) with an
in-browser adaptive engine, a mastery keyboard, and progress codes. See [docs/roadmap.md](docs/roadmap.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN IP, for testing on an iPad)
npm test           # unit tests
npm run test:e2e   # end-to-end tests (set NO_WEBKIT=1 if Playwright's WebKit can't run on your OS)
```

Add `?debug` to the URL for the learner-model panel (with time travel to test next-day gold keys).

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching, testing, and CI conventions.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/design.md](docs/design.md) | The product design: goals, skills, game modes, adaptive engine, incentives, persistence, input, themes |
| [docs/decisions.md](docs/decisions.md) | Dated log of decisions and *why* we made them. Append-only. |
| [docs/open-questions.md](docs/open-questions.md) | Unresolved questions, parked ideas, and risks |
| [docs/roadmap.md](docs/roadmap.md) | Phases and what's in each |

## Credits

Music glyphs come from the [Bravura](https://github.com/steinbergmedia/bravura) font by Steinberg
Media Technologies, licensed under the SIL Open Font License 1.1 (`licenses/Bravura-OFL.txt`).

**Rule:** if a decision only lives in a chat session or someone's head, it doesn't exist. Record it in
`docs/decisions.md`.
