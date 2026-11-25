// Simulated kids for pacing tests. Each persona plays through the real session flow
// (startSession → nextQuestion → submit), one 20-question session per day, with realistic
// response times. Everything runs off a seeded RNG, so results are reproducible.

import { diagnose } from '../src/core/diagnose';
import { STRICT_PACING, createEngine } from '../src/core/engine';
import { NAME_IT } from '../src/core/items';
import { LETTER_ITEMS, LETTER_MATH, type Rung, letterItem } from '../src/core/letters';
import { LETTERS, type Letter } from '../src/core/music';
import { type SessionMode, isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import { DAY, T0, seededRng } from './helpers';

/** The engines as they were before the fast track, for before/after comparisons. */
export const STRICT_LETTERS: SessionMode = { engine: createEngine(LETTER_MATH, STRICT_PACING) };
export const STRICT_NAME_IT: SessionMode = { engine: createEngine(NAME_IT, STRICT_PACING), diagnose };

export interface Persona {
  /**
   * Answer one question. `exposures` = times this kid has seen the item before (they learn from
   * the feedback); `skillExposures` = times they've seen any item of the same skill.
   */
  answer(
    itemId: string,
    target: Letter,
    exposures: number,
    skillExposures: number,
    rng: () => number,
  ): { answer: Letter | null; rtMs: number };
  /** The kid's true chance of getting this item right now (to measure overload, not to play). */
  pCorrect(itemId: string, exposures: number, skillExposures: number): number;
}

const otherLetter = (target: Letter, rng: () => number): Letter => {
  const others = LETTERS.filter((l) => l !== target);
  return others[Math.floor(rng() * others.length)]!;
};

/** Already knows the material: right `p` of the time, fluent. */
export function knower(p = 0.97, rtMs = 1800): Persona {
  return {
    answer: (_id, target, _e, _s, rng) => ({
      answer: rng() < p ? target : otherLetter(target, rng),
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
export function learner(k0: (itemId: string) => number, rtMs = 2500, itemRate = 0.18, skillRate = 0.04): Persona {
  const knowledge = (id: string, exposures: number, skillExposures: number) => {
    const kItem = 1 - (1 - k0(id)) * (1 - itemRate) ** exposures;
    const kSkill = 1 - (1 - skillRate) ** skillExposures;
    return 1 - (1 - kItem) * (1 - 0.8 * kSkill);
  };
  return {
    pCorrect: (id, e, s) => {
      const k = knowledge(id, e, s);
      return k * 0.97 + (1 - k) * 0.5 * (1 / 7);
    },
    answer(id, target, exposures, skillExposures, rng) {
      const known = rng() < knowledge(id, exposures, skillExposures);
      const rt = (known ? rtMs : rtMs * 2) * (0.75 + 0.5 * rng());
      if (known) return { answer: rng() < 0.97 ? target : otherLetter(target, rng), rtMs: rt };
      if (rng() < 0.5) return { answer: null, rtMs: rt };
      return { answer: LETTERS[Math.floor(rng() * 7)]!, rtMs: rt };
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

/** Mashes a random letter as fast as possible. */
export const guesser: Persona = {
  answer: (_i, _t, _e, _s, rng) => ({ answer: LETTERS[Math.floor(rng() * 7)]!, rtMs: 250 + 100 * rng() }),
  pCorrect: () => 1 / 7,
};

/** Presses the same button every time. */
export function oneButton(button: Letter): Persona {
  return { answer: (_i, _t, _e, _s, rng) => ({ answer: button, rtMs: 300 + 100 * rng() }), pCorrect: () => 1 / 7 };
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

export interface SimResult {
  sessions: SessionStats[];
  /** Session (1-based) by the end of which each item was open; absent = never. */
  openedBy: Map<string, number>;
}

/** A person's skill (for the persona's learning, not the engine's): Letter Math by distance moved. */
export const humanSkill = (id: string) => (id.startsWith('lm:') ? String(letterItem(id).steps) : id);

export function simulate(opts: {
  mode: SessionMode;
  groups: string[];
  persona: Persona;
  sessions: number;
  seed: number;
}): SimResult {
  const { engine } = opts.mode;
  const rng = seededRng(opts.seed);
  const state = engine.newStudent();
  const exposures = new Map<string, number>();
  const skillExposures = new Map<string, number>();
  const seen = (id: string) => [exposures.get(id) ?? 0, skillExposures.get(humanSkill(id)) ?? 0] as const;
  const lane = engine.set.items.filter((i) => opts.groups.includes(engine.set.groupOf(i)));
  const openedBy = new Map<string, number>();
  const sessions: SessionStats[] = [];
  let now = T0;
  for (let n = 1; n <= opts.sessions; n++) {
    const session = startSession(opts.groups, 20, opts.mode);
    const stats: SessionStats = { correct: 0, total: 0, silver: 0, gold: 0, unlocked: 0, maxStruggling: 0 };
    while (!isFinished(session)) {
      const q = nextQuestion(session, state, now, rng);
      const struggling = lane.filter((i) => state.items[i.id]!.unlocked && opts.persona.pCorrect(i.id, ...seen(i.id)) < 0.7);
      stats.maxStruggling = Math.max(stats.maxStruggling, struggling.length);
      const { answer, rtMs } = opts.persona.answer(q.itemId, engine.answerOf(q.itemId), ...seen(q.itemId), rng);
      exposures.set(q.itemId, (exposures.get(q.itemId) ?? 0) + 1);
      skillExposures.set(humanSkill(q.itemId), (skillExposures.get(humanSkill(q.itemId)) ?? 0) + 1);
      now += Math.round(rtMs);
      const res = submit(session, state, answer, now);
      stats.total++;
      if (res.outcome === 'correct') stats.correct++;
      for (const e of res.events) if (e.kind !== 'polished') stats[e.kind]++;
      now += res.outcome === 'correct' ? 800 : 4000;
    }
    for (const i of engine.set.items) {
      if (state.items[i.id]!.unlocked && !openedBy.has(i.id)) openedBy.set(i.id, n);
    }
    sessions.push(stats);
    now += DAY;
  }
  return { sessions, openedBy };
}

/** Item ids of a Letter Math rung. */
export const rungIds = (rung: Rung) => LETTER_ITEMS.filter((i) => i.rung === rung).map((i) => i.id);

/** First session by the end of which ANY of `ids` was open (Infinity = never). */
export const firstOpen = (res: SimResult, ids: string[]) => Math.min(...ids.map((id) => res.openedBy.get(id) ?? Infinity));

/** First session by the end of which ALL of `ids` were open (Infinity = never). */
export const allOpen = (res: SimResult, ids: string[]) => Math.max(...ids.map((id) => res.openedBy.get(id) ?? Infinity));

/** Items open by the end of session `n`. */
export const openAfter = (res: SimResult, n: number) => [...res.openedBy.values()].filter((s) => s <= n).length;

export const successRate = (s: SessionStats) => s.correct / s.total;
export const overallSuccess = (res: SimResult) =>
  res.sessions.reduce((a, s) => a + s.correct, 0) / res.sessions.reduce((a, s) => a + s.total, 0);
export const total = (res: SimResult, kind: 'silver' | 'gold' | 'unlocked') => res.sessions.reduce((a, s) => a + s[kind], 0);
