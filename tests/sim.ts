// Learner simulation harness, shared by every mode's tests.
//
// A simulated kid (a `Policy`) plays real sessions (startSession → nextQuestion → submit) against any
// engine, one session per `sessionGapHours`, with response times, and the harness reports what the
// engine did about it. Everything is deterministic: a seeded RNG drives both the engine's picks and
// the kid, and the clock is injected (`startTime`, advanced by response times and session gaps).
//
//   const r = simulate({ engine: letterEngine, groups: [LETTER_GROUP], policy: randomGuesser(),
//                        sessions: 30, seed: 1 });
//   r.silver, r.gold, r.unlocked   reward events earned (the guardrails: guessers get none)
//   r.meanRecall                   mean recall estimate over the items open at the end
//   r.picks, r.answers             every question asked / answer given, in order (variety checks)
//   r.sessions, r.openedBy         per-session stats and the session each item opened in (pacing)
//   r.state                        the learner model at the end
//
// Pass `mode` instead of `engine` for modes with a misconception detector (Name It's `diagnose`).
// Any answer type works: policies are generic over it and take the mode's answer space (letters by
// default), e.g. `randomGuesser(['step', 'skip'])`.
//
// Policies (the kids):
//   randomGuesser(space)         mashes a random answer, fast
//   masher(answer)               presses the same button every time (`oneButton` is its old name)
//   honestLearner({ learnAfter, idkWhenUnknown })
//                                right once they've seen the item `learnAfter` times; before that
//                                says "?" (or guesses when idkWhenUnknown is false)
//   sandbagger()                 knows everything but answers slowly at first to inflate their own
//                                speed baseline, then sprints: tries to game the fluency gate
//   knower(p), learner(k0)       a kid who already knows it / who learns with practice (pacing tests)

import { diagnose } from '../src/core/diagnose';
import { type Engine, type Outcome, STRICT_PACING, type StudentState, createEngine, recall } from '../src/core/engine';
import type { PracticeItem } from '../src/core/itemset';
import { NAME_IT } from '../src/core/items';
import { LETTER_ITEMS, LETTER_MATH, type Rung, letterItem } from '../src/core/letters';
import { LETTERS, type Letter } from '../src/core/music';
import { SESSION_LENGTH, type SessionMode, isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import { HOUR, T0, seededRng } from './helpers';

/** The engines as they were before the fast track, for before/after comparisons. */
export const STRICT_LETTERS: SessionMode = { engine: createEngine(LETTER_MATH, STRICT_PACING) };
export const STRICT_NAME_IT: SessionMode<string> = { engine: createEngine(NAME_IT, STRICT_PACING), diagnose };

/** A simulated kid. */
export interface Policy<A extends string = Letter> {
  /**
   * Answer one question. `exposures` = times this kid has seen the item before (they learn from
   * the feedback); `skillExposures` = times they've seen any item of the same skill.
   */
  answer(
    itemId: string,
    target: A,
    exposures: number,
    skillExposures: number,
    rng: () => number,
  ): { answer: A | null; rtMs: number };
  /** The kid's true chance of getting this item right now (to measure overload, not to play). */
  pCorrect(itemId: string, exposures: number, skillExposures: number): number;
}

/** The answer space a policy draws wrong answers and guesses from (letters unless told otherwise). */
const spaceOf = <A extends string>(answerSpace?: readonly A[]) => (answerSpace ?? LETTERS) as readonly A[];

const pick = <A extends string>(from: readonly A[], rng: () => number): A => from[Math.floor(rng() * from.length)]!;
const otherAnswer = <A extends string>(target: A, from: readonly A[], rng: () => number): A =>
  pick(
    from.filter((a) => a !== target),
    rng,
  );

/** Already knows the material: right `p` of the time, fluent. */
export function knower<A extends string = Letter>(p = 0.97, rtMs = 1800, answerSpace?: readonly A[]): Policy<A> {
  const from = spaceOf(answerSpace);
  return {
    answer: (_id, target, _e, _s, rng) => ({
      answer: rng() < p ? target : otherAnswer(target, from, rng),
      rtMs: rtMs * (0.75 + 0.5 * rng()),
    }),
    pCorrect: () => p,
  };
}

/**
 * Learns with practice. Knowledge of an item grows with exposures to the item itself and to its
 * skill (practicing "after C" and "after E" helps with "after D"). When they know it they're right
 * 97% of the time; otherwise they press "?" or guess, and take twice as long.
 */
export function learner<A extends string = Letter>(
  k0: (itemId: string) => number,
  rtMs = 2500,
  itemRate = 0.18,
  skillRate = 0.04,
  answerSpace?: readonly A[],
): Policy<A> {
  const from = spaceOf(answerSpace);
  const knowledge = (id: string, exposures: number, skillExposures: number) => {
    const kItem = 1 - (1 - k0(id)) * (1 - itemRate) ** exposures;
    const kSkill = 1 - (1 - skillRate) ** skillExposures;
    return 1 - (1 - kItem) * (1 - 0.8 * kSkill);
  };
  return {
    pCorrect: (id, e, s) => {
      const k = knowledge(id, e, s);
      return k * 0.97 + (1 - k) * 0.5 * (1 / from.length);
    },
    answer(id, target, exposures, skillExposures, rng) {
      const known = rng() < knowledge(id, exposures, skillExposures);
      const rt = (known ? rtMs : rtMs * 2) * (0.75 + 0.5 * rng());
      if (known) return { answer: rng() < 0.97 ? target : otherAnswer(target, from, rng), rtMs: rt };
      if (rng() < 0.5) return { answer: null, rtMs: rt };
      return { answer: pick(from, rng), rtMs: rt };
    },
  };
}

const isInterval = (id: string) => /^lm:(up|down)\d:/.test(id);

/** Letter Math true beginner: knows a little of next-letter-up, less of down, nothing else. */
export const lmBeginner = learner((id) => (id.includes(':after:') ? 0.3 : id.includes(':before:') ? 0.15 : 0.05));
/** Knows next letter and skips cold, but not interval names (2nds/3rds partly, from the hint). */
export const lmMixed = learner((id) => (!isInterval(id) ? 1 : /:(up|down)[23]:/.test(id) ? 0.3 : 0.05), 1800);
/** Name It beginner: barely knows any notes. */
export const nameBeginner = learner(() => 0.1, 2000);

/** Mashes a random answer as fast as possible. */
export function randomGuesser<A extends string = Letter>(answerSpace?: readonly A[]): Policy<A> {
  const from = spaceOf(answerSpace);
  return {
    answer: (_i, _t, _e, _s, rng) => ({ answer: pick(from, rng), rtMs: 250 + 100 * rng() }),
    pCorrect: () => 1 / from.length,
  };
}
export const guesser: Policy = randomGuesser();

/** Presses the same button every time (`answerSpaceSize` only feeds `pCorrect`; letters = 7). */
export function masher<A extends string = Letter>(answer: A, answerSpaceSize: number = LETTERS.length): Policy<A> {
  return { answer: (_i, _t, _e, _s, rng) => ({ answer, rtMs: 300 + 100 * rng() }), pCorrect: () => 1 / answerSpaceSize };
}
export const oneButton = (button: Letter): Policy => masher(button);

/**
 * An honest kid: knows an item once they've seen it `learnAfter` times (the feedback teaches them).
 * Until then they press "?" (`idkWhenUnknown`, the default) or guess. Always right once they know.
 */
export function honestLearner<A extends string = Letter>(opts: {
  learnAfter: number;
  idkWhenUnknown?: boolean;
  rtMs?: number;
  answerSpace?: readonly A[];
}): Policy<A> {
  const { learnAfter, idkWhenUnknown = true, rtMs = 1800 } = opts;
  const from = spaceOf(opts.answerSpace);
  const knows = (exposures: number) => exposures >= learnAfter;
  return {
    answer(_id, target, exposures, _s, rng) {
      const jitter = 0.75 + 0.5 * rng();
      if (knows(exposures)) return { answer: target, rtMs: rtMs * jitter };
      return { answer: idkWhenUnknown ? null : pick(from, rng), rtMs: rtMs * 2 * jitter };
    },
    pCorrect: (_id, exposures) => (knows(exposures) ? 1 : idkWhenUnknown ? 0 : 1 / from.length),
  };
}

/**
 * Knows everything, but takes `slowMs` per answer for their first `slowAnswers` answers (inflating
 * the speed baseline the engine judges them against), then answers at `fastMs`. The exploit being
 * tested: does a padded baseline earn mastery faster than just playing at that speed? Counts
 * answers itself, so make a new one for each run.
 */
export function sandbagger<A extends string = Letter>(
  opts: { slowMs?: number; slowAnswers?: number; fastMs?: number } = {},
): Policy<A> {
  const { slowMs = 15000, slowAnswers = 40, fastMs = 900 } = opts;
  let answered = 0;
  return {
    answer: (_id, target, _e, _s, rng) => ({ answer: target, rtMs: (answered++ < slowAnswers ? slowMs : fastMs) * (0.9 + 0.2 * rng()) }),
    pCorrect: () => 1,
  };
}

export interface SessionStats {
  correct: number;
  total: number;
  silver: number;
  gold: number;
  unlocked: number;
  /** Most open items the kid truly can't answer yet (< 70% chance) at once during the session. */
  maxStruggling: number;
}

export interface SimResult<A extends string = Letter> {
  sessions: SessionStats[];
  /** Session (1-based) by the end of which each item was open; absent = never. */
  openedBy: Map<string, number>;
  /** Totals over the whole run: reward events earned (new mastery only, decision D12). */
  silver: number;
  gold: number;
  unlocked: number;
  /** Mean recall estimate of the items open at the end, as of the last answer. */
  meanRecall: number;
  /** Every item asked, in order. */
  picks: string[];
  /** Every answer given (null = "?"), in order, parallel to `picks`. */
  answers: (A | null)[];
  /** How the engine graded each answer (`engine.grade`), parallel to `picks`. */
  outcomes: Outcome[];
  /** The learner model at the end. */
  state: StudentState;
}

/** A person's skill (for the policy's learning, not the engine's): Letter Math by distance moved. */
export const humanSkill = (id: string) => (id.startsWith('lm:') ? String(letterItem(id).steps) : id);

export type SimOptions<A extends string> = {
  groups: string[];
  policy: Policy<A>;
  sessions: number;
  seed: number;
  /** Epoch ms of the first question (default: noon on a fixed date, see helpers.ts). */
  startTime?: number;
  /** Hours from the end of one session to the start of the next (default 24: practice daily). */
  sessionGapHours?: number;
  /** Questions per session (default SESSION_LENGTH). */
  sessionLength?: number;
  /** How the simulated person groups items into skills (default: Letter Math by distance moved). */
  skillOf?: (itemId: string) => string;
} & ({ engine: Engine<PracticeItem, A>; mode?: undefined } | { mode: SessionMode<A>; engine?: undefined });

export function simulate<A extends string = Letter>(opts: SimOptions<A>): SimResult<A> {
  const mode: SessionMode<A> = opts.mode ?? { engine: opts.engine! };
  const { engine } = mode;
  const skillOf = opts.skillOf ?? humanSkill;
  const rng = seededRng(opts.seed);
  const state = engine.newStudent();
  const exposures = new Map<string, number>();
  const skillExposures = new Map<string, number>();
  const seen = (id: string) => [exposures.get(id) ?? 0, skillExposures.get(skillOf(id)) ?? 0] as const;
  const lane = engine.set.items.filter((i) => opts.groups.includes(engine.set.groupOf(i)));
  const openedBy = new Map<string, number>();
  const sessions: SessionStats[] = [];
  const picks: string[] = [];
  const answers: (A | null)[] = [];
  const outcomes: Outcome[] = [];
  let now = opts.startTime ?? T0;
  let lastAnswerAt = now;
  for (let n = 1; n <= opts.sessions; n++) {
    const session = startSession(opts.groups, opts.sessionLength ?? SESSION_LENGTH, mode);
    const stats: SessionStats = { correct: 0, total: 0, silver: 0, gold: 0, unlocked: 0, maxStruggling: 0 };
    while (!isFinished(session)) {
      const q = nextQuestion(session, state, now, rng);
      const struggling = lane.filter((i) => state.items[i.id]!.unlocked && opts.policy.pCorrect(i.id, ...seen(i.id)) < 0.7);
      stats.maxStruggling = Math.max(stats.maxStruggling, struggling.length);
      const { answer, rtMs } = opts.policy.answer(q.itemId, engine.answerOf(q.itemId), ...seen(q.itemId), rng);
      picks.push(q.itemId);
      answers.push(answer);
      outcomes.push(engine.grade(q.itemId, answer));
      exposures.set(q.itemId, (exposures.get(q.itemId) ?? 0) + 1);
      skillExposures.set(skillOf(q.itemId), (skillExposures.get(skillOf(q.itemId)) ?? 0) + 1);
      now += Math.round(rtMs);
      const res = submit(session, state, answer, now);
      lastAnswerAt = now;
      stats.total++;
      if (res.outcome === 'correct') stats.correct++;
      for (const e of res.events) if (e.kind !== 'polished') stats[e.kind]++;
      now += res.outcome === 'correct' ? 800 : 4000;
    }
    for (const i of engine.set.items) {
      if (state.items[i.id]!.unlocked && !openedBy.has(i.id)) openedBy.set(i.id, n);
    }
    sessions.push(stats);
    now += (opts.sessionGapHours ?? 24) * HOUR;
  }
  const open = engine.set.items.filter((i) => state.items[i.id]!.unlocked);
  const sum = (kind: 'silver' | 'gold' | 'unlocked') => sessions.reduce((a, s) => a + s[kind], 0);
  return {
    sessions,
    openedBy,
    silver: sum('silver'),
    gold: sum('gold'),
    unlocked: sum('unlocked'),
    meanRecall: open.reduce((a, i) => a + recall(state.items[i.id]!, lastAnswerAt), 0) / Math.max(1, open.length),
    picks,
    answers,
    outcomes,
    state,
  };
}

/** Item ids of a Letter Math rung. */
export const rungIds = (rung: Rung) => LETTER_ITEMS.filter((i) => i.rung === rung).map((i) => i.id);

/** First session by the end of which ANY of `ids` was open (Infinity = never). */
export const firstOpen = (res: SimResult<string>, ids: string[]) => Math.min(...ids.map((id) => res.openedBy.get(id) ?? Infinity));

/** First session by the end of which ALL of `ids` were open (Infinity = never). */
export const allOpen = (res: SimResult<string>, ids: string[]) => Math.max(...ids.map((id) => res.openedBy.get(id) ?? Infinity));

/** Items open by the end of session `n`. */
export const openAfter = (res: SimResult<string>, n: number) => [...res.openedBy.values()].filter((s) => s <= n).length;

export const successRate = (s: SessionStats) => s.correct / s.total;
export const overallSuccess = (res: SimResult<string>) =>
  res.sessions.reduce((a, s) => a + s.correct, 0) / res.sessions.reduce((a, s) => a + s.total, 0);
export const total = (res: SimResult<string>, kind: 'silver' | 'gold' | 'unlocked') => res[kind];
