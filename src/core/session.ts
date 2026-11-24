// A practice session: a short run of questions that always ends on easy wins.
// Works for any mode: the session carries the mode's engine (and optional misconception detector).

import { type LessonId, diagnose } from './diagnose';
import { type Engine, type MasteryEvent, type Outcome, type Rng, type StudentState, nameEngine } from './engine';
import type { Letter } from './music';

export const SESSION_LENGTH = 20;
const FINISH_EASY = 3;

/** What a session needs from a game mode. */
export interface SessionMode {
  engine: Engine;
  /** Spot a misconception after a wrong answer and suggest a mini-lesson (optional). */
  diagnose?: (state: StudentState, now: number) => LessonId | null;
}

export const NAME_IT_MODE: SessionMode = { engine: nameEngine, diagnose };

export interface Question {
  itemId: string;
  shownAt: number;
}

export interface Session {
  mode: SessionMode;
  /** Unlock lanes to practice (Name It: the chosen clefs). */
  groups: string[];
  length: number;
  results: { itemId: string; outcome: Outcome; rtMs: number }[];
  events: MasteryEvent[];
  current: Question | null;
}

export function startSession(groups: string[], length = SESSION_LENGTH, mode: SessionMode = NAME_IT_MODE): Session {
  return { mode, groups, length, results: [], events: [], current: null };
}

export function isFinished(session: Session): boolean {
  return session.results.length >= session.length;
}

export function nextQuestion(session: Session, state: StudentState, now: number, rng: Rng): Question {
  const remaining = session.length - session.results.length;
  const pick = remaining <= FINISH_EASY ? 'finish' : 'normal';
  const recent = session.results.map((r) => ({ itemId: r.itemId, correct: r.outcome === 'correct' }));
  session.current = { itemId: session.mode.engine.selectItem(state, session.groups, now, rng, recent, pick), shownAt: now };
  return session.current;
}

export interface SubmitResult {
  outcome: Outcome;
  events: MasteryEvent[];
  lesson: LessonId | null;
}

/** Submit an answer to the current question. `answer = null` means "I don't know". */
export function submit(session: Session, state: StudentState, answer: Letter | null, now: number): SubmitResult {
  const q = session.current;
  if (!q) throw new Error('No current question');
  const { engine } = session.mode;
  const target = engine.answerOf(q.itemId);
  const outcome: Outcome = answer === null ? 'idk' : answer === target ? 'correct' : 'wrong';
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

export function summarize(session: Session): Summary {
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
