// A practice session: a short run of questions that always ends on easy wins.
// Works for any mode: the session carries the mode's engine (and optional misconception detector),
// and is generic over the mode's answer type `A` (a Letter unless the mode says otherwise).

import { diagnose } from './diagnose';
import { type Engine, type MasteryEvent, type Outcome, type Rng, type StudentState, nameEngine } from './engine';
import type { PracticeItem } from './itemset';
import type { Letter } from './music';

export const SESSION_LENGTH = 20;
const FINISH_EASY = 3;

/** What a session needs from a game mode. */
export interface SessionMode<A extends string = Letter> {
  engine: Engine<PracticeItem, A>;
  /** Spot a misconception after a wrong answer and return the id of a mini-lesson to show (optional). */
  diagnose?: (state: StudentState, now: number) => string | null;
  /** The mode's own lessons, by id (optional). Ids not listed here are Name It's (see diagnose.ts LESSONS). */
  lessons?: Readonly<Record<string, Lesson>>;
}

/** A mini-lesson shown after a wrong answer: a title and a few short paragraphs. */
export interface Lesson {
  title: string;
  body: readonly string[];
}

export const NAME_IT_MODE: SessionMode<string> = { engine: nameEngine, diagnose };

export interface Question {
  itemId: string;
  shownAt: number;
}

export interface Session<A extends string = Letter> {
  mode: SessionMode<A>;
  /** Unlock lanes to practice (Name It: the chosen clefs). */
  groups: string[];
  length: number;
  results: { itemId: string; outcome: Outcome; rtMs: number }[];
  events: MasteryEvent[];
  current: Question | null;
}

/** Start a session. With no mode it is Name It; any other mode passes its own. */
export function startSession(groups: string[], length?: number): Session<string>;
export function startSession<A extends string>(groups: string[], length: number | undefined, mode: SessionMode<A>): Session<A>;
export function startSession(groups: string[], length = SESSION_LENGTH, mode: SessionMode<string> = NAME_IT_MODE): Session<string> {
  return { mode, groups, length, results: [], events: [], current: null };
}

export function isFinished(session: Session<string>): boolean {
  return session.results.length >= session.length;
}

export function nextQuestion(session: Session<string>, state: StudentState, now: number, rng: Rng): Question {
  const remaining = session.length - session.results.length;
  const pick = remaining <= FINISH_EASY ? 'finish' : 'normal';
  const recent = session.results.map((r) => ({ itemId: r.itemId, correct: r.outcome === 'correct' }));
  session.current = { itemId: session.mode.engine.selectItem(state, session.groups, now, rng, recent, pick), shownAt: now };
  return session.current;
}

export interface SubmitResult {
  outcome: Outcome;
  events: MasteryEvent[];
  lesson: string | null;
}

/** Submit an answer to the current question. `answer = null` means "I don't know". */
export function submit<A extends string>(session: Session<A>, state: StudentState, answer: NoInfer<A> | null, now: number): SubmitResult {
  const q = session.current;
  if (!q) throw new Error('No current question');
  const { engine } = session.mode;
  const outcome = engine.grade(q.itemId, answer);
  const rtMs = now - q.shownAt;
  const { events } = engine.recordAnswer(state, q.itemId, outcome, answer, rtMs, now);
  session.results.push({ itemId: q.itemId, outcome, rtMs });
  session.events.push(...events);
  session.current = null;
  const lesson = outcome === 'wrong' && session.mode.diagnose ? session.mode.diagnose(state, now) : null;
  return { outcome, events, lesson };
}

export interface Summary {
  total: number;
  correct: number;
  idk: number;
  newSilver: string[];
  newGold: string[];
  polished: string[];
  unlocked: string[];
}

export function summarize(session: Session<string>): Summary {
  const ids = (kind: MasteryEvent['kind']) => session.events.filter((e) => e.kind === kind).map((e) => e.itemId);
  return {
    total: session.results.length,
    correct: session.results.filter((r) => r.outcome === 'correct').length,
    idk: session.results.filter((r) => r.outcome === 'idk').length,
    newSilver: ids('silver'),
    newGold: ids('gold'),
    polished: ids('polished'),
    unlocked: ids('unlocked'),
  };
}
