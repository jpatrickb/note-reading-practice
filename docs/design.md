# Design

Living document. It describes what we're building and why. For the history of how we got here, see
[decisions.md](decisions.md).

---

## 1. Objective

**Maximize long-term musical understanding, with enjoyment as a constraint that must stay above a
threshold.** We are not maximizing engagement or time-on-app. Engagement is a guardrail.

The target skill is **instant, automatic links between four representations of a note**:

```
        STAFF (symbol)
         /     |     \
     NAME —————+———— KEYBOARD (location)
         \     |     /
          SOUND (relative pitch only)
```

Then we build from single notes up to **patterns**: the musical alphabet, intervals, chord shapes,
key signatures, phrases.

### Priorities

1. **Staff ↔ name.** This is the primary skill. Note names are the shared vocabulary of music theory
   ("a third above D is F", "G major is G-B-D") and they carry over to other instruments. It is the
   teacher's current focus and the weakest link she sees in students.
2. **Staff ↔ keyboard.** Location on the piano.
3. **Musical alphabet fluency.** Forward and backward, skips, and "letter math". The foundation of theory.
4. **Relative-pitch ear training.**

### What "learned" means

- **Accuracy *and* speed (fluency).** Accuracy comes first, then speed. Response time is a first-class
  signal.
- **Retention, not in-session performance.** Knowing a note three days later matters more than getting
  it right today. Metrics should reflect retained knowledge.

### Hard rule: no perfect pitch

Most people don't have perfect pitch. **Every ear task supplies a reference pitch.** We never ask for a
note name from sound alone. Allowed: identifying intervals, melodic direction, step/skip, and finding
the next note given a starting note.

**Sound is always on.** Every note shown or answered plays, which gives free ear training on every
question.

---

## 2. Content ladder

The skill ladder runs from easy to hard. The adaptive engine moves each student along it.

1. Landmark notes (Middle C, Treble G, Bass F, and similar)
2. Natural notes, treble clef, within the staff
3. Natural notes, bass clef, within the staff
4. Mixed clefs (interleaved)
5. Ledger lines
6. **Accidentals** (sharps and flats)
7. **Enharmonic equivalents** (C♯ = D♭, E♯ = F, and so on)
8. Intervals: step / skip / leap, then numbered intervals
9. Triads (major vs minor), chord spelling
10. Key signatures
11. Short phrases / sight-reading

Accidentals change name input: we move from 7 letter buttons to letter + accidental. Enharmonic
questions must accept or ask for the spelling that's correct in context.

---

## 3. Game modes

Every link is practiced **in both directions**, with naming at the center.

| Mode | Link | Notes |
|---|---|---|
| **Name It** | staff → name | Core drill. A–G buttons; on a laptop, kids can also type the letter. |
| **Place It** | name → staff | Tap the line or space. Harder (they must produce the answer), so it's great for retention. |
| **Note Catcher** | staff → key | Tap the on-screen key. |
| **Find All** | name → key | "Find all the Cs." |
| **Key to Staff** | key → staff | |
| **Letter Math** | alphabet ↔ alphabet | Forward and backward, skips (C-E-G-B-D-F-A), "what's a 5th above D?". No staff or audio needed. |
| **Word Decoder** | staff → names (sequence) | Notes spell words (CABBAGE, BAGGAGE). |
| **Step or Skip?** | intervals | See it, hear it, name it. Bridge to theory. |
| **Snowman Chords** | triads | Build and hear major vs minor. |
| **Echo** | reference + sound → key | Relative pitch only (see hard rule). |
| **Melody Boss** | phrase reading | When they get it, it plays back as music with accompaniment. |

---

## 4. Adaptive engine (runs in the browser)

One generic engine (`createEngine(itemSet)`) serves every mode. A mode supplies its items, unlock
lanes in teaching order, and the correct answer for each item. Each mode keeps its own learner model
(D55).

- **Item** = (note, clef, task type), giving a few hundred items in total.
- **Per-item state:** a mastery estimate (Elo or Bayesian Knowledge Tracing), response time relative to
  the student's own baseline, when it was last seen, and a spacing interval.
- **Selection:** weight each note by how much it needs practice (1 − recall), so weak notes are never
  abandoned. A controller keeps the kid's actual success near **~80%** (leaning on known notes during
  a rough patch, harder ones when cruising). Repeating the same answer letter back-to-back is
  discouraged. With both clefs, attention is split by clef first, and the weaker clef gets more.
- **Unlocking:** one note at a time, in a hand-written teaching order where the first 7 notes of each
  clef cover all 7 letters. A new note unlocks only when the open notes are solid.
- **New notes:** quizzed right away (pretesting). "?" or a miss teaches them.
- **Confusion matrix:** track which wrong answers happen (for example D read as F). Detect
  **systematic misconceptions** (for example reading bass clef as treble, which shifts every answer by
  a third) and trigger a short targeted mini-lesson.
- **Feedback when wrong:** explain, don't just buzz. Show the correct answer next to theirs, with
  **both a mnemonic and a landmark hint** ("Every Good Boy… → 3rd line" + "2 steps up from Treble G").
  The teacher uses Faber + mnemonics; landmark thinking is added alongside.
- **Size:** the whole model compresses to roughly < 1 KB per student.

### Placement

A new device or student does a **~60-second adaptive placement round** (binary-search style) instead of
choosing a difficulty from a menu. The model converges within about 10–20 answers even if placement
was sandbagged.

---

## 5. Incentives & motivation

Design rule: **whatever we reward, kids will optimize for, so reward only what we actually want.**

### Anti-gaming: make honest effort the best strategy; don't police guessing

- **No speed thresholds and no "guessing detection."** Heuristics would wrongly punish fast kids. Speed
  is only ever compared to the student's own history.
- **Fast and correct always counts.**
- **Asymmetric scoring:** a wrong answer costs more than a right answer earns, tuned so random guessing
  yields *negative* progress. Mashing simply doesn't light up the map. Nothing gets flagged.
- **"?" (I don't know) button:** costs less than a wrong answer and shows a hint. It rewards honesty
  and gives the model cleaner data than a guess.

### Reward new mastery, not activity

- Rewards come only from **changes** in mastery (a key turning gold, a weak note getting stronger).
  Replaying already-mastered material keeps it solid but earns nothing new.
- Kids choose **what** to practice (clef, mode, theme), not difficulty within it. That keeps autonomy
  without letting them farm easy items.
- Never reward time spent or number of questions answered.

### Avoid the overjustification effect

Many students are in piano because their parents make them. The goal is for them to **enjoy music**,
not grind for points.

- Rewards are **informational** ("look how much you've grown"), not controlling.
- **The best rewards are more music:** songs to unlock (public domain, to avoid copyright), instrument
  sounds, accompaniment, and eventually a **compose sandbox** using the notes they've mastered.
- **The keyboard is the trophy:** a mastery map where keys turn gold as notes are mastered, per clef.

### Habits

- **Weekly goals, not daily streaks** (for example 4 days a week, with forgiveness). Kids don't control
  their schedules, and broken streaks teach "I failed."
- **Short sessions (5–10 min) that always end on a success** (peak-end rule).
- **No leaderboards across kids.** Compare each kid only to their own past.
- **Relatedness:** the teacher seeing progress and mentioning it at the lesson matters more than any
  badge (see the teacher page under §6).

---

## 6. Architecture: local-first

Do as much as possible **in the browser**. Target **$0 hosting**. **No accounts.**

| Tier | What | Infra |
|---|---|---|
| **0. Local** | Progress stored on the device (IndexedDB). Works offline as an installable web app (PWA). | Static hosting (Cloudflare Pages) |
| **1. Progress code** | Export/import progress as a short code or QR code, for moving between devices and as a backup. | None |
| **2. Optional sync** | A random sync code (for example `purple-tiger-42`) is the only credential. A Cloudflare Worker stores the progress blob in KV or D1. No passwords, no email, no personal info. | Cloudflare Workers free tier |
| **3. Teacher page** | The teacher views synced students' progress, built on tier 2. Student names live only on the teacher's device. | Same Worker |

- The core game must work fully without tiers 2 and 3.
- **Privacy:** collect no personal information. Children's privacy law (COPPA) is much simpler when
  nothing identifying is stored.

### iPad/Safari data loss: mitigated (D46–D50)

Safari (which means **every browser on iPad**) deletes a site's stored data after **7 days without a
visit**, unless the site is added to the Home Screen. iPads are expected to be common. Mitigations:

1. Prompt iPad users to **Add to Home Screen** (installed web apps are exempt).
2. Request persistent storage with `navigator.storage.persist()`.
3. Encourage optional sync (tier 2) and the progress code as backups.

---

## 7. Input

- **Name input:** big A–G buttons everywhere; typing letters on a laptop keyboard. Later, letter +
  accidental.
- **On-screen keyboard** for location tasks. Touch and mouse both work.
- **Touch targets ≥ 44px**, iPad landscape as a primary layout.
- **Real piano (mic pitch detection): parked.** See [open-questions.md](open-questions.md). The core
  game never depends on it.
- **MIDI: not a focus.** Most families won't have a digital keyboard or know how to connect one, and
  Safari/iPad doesn't support Web MIDI.

---

## 8. Themes

Ages span early elementary to high school, so **kids choose from several visual themes** that use the
same engine underneath: playful and young, clean and minimal for older kids, and a range of styles so
every kid finds something they like. Six themes ship (D52), with contrast enforced by a unit test (D51).
