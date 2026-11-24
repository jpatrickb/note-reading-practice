// A practice session: a short run of questions that always ends on easy wins.

import { type LessonId, diagnose } from './diagnose';
import { type MasteryEvent, type Outcome, type Rng, type StudentState, recordAnswer, selectItem } from './engine';
import { itemById } from './items';
import type { Clef, Letter } from './music';

export const SESSION_LENGTH = 20;
const FINISH_EASY = 3;

export interface Question {
  itemId: string;
  shownAt: number;
}

export interface Session {
  clefs: Clef[];
  length: number;
  results: { itemId: string; outcome: Outcome; rtMs: number }[];
  events: MasteryEvent[];
  current: Question | null;
}

export function startSession(clefs: Clef[], length = SESSION_LENGTH): Session {
  return { clefs, length, results: [], events: [], current: null };
}

export function isFinished(session: Session): boolean {
  return session.results.length >= session.length;
}

export function nextQuestion(session: Session, state: StudentState, now: number, rng: Rng): Question {
  const remaining = session.length - session.results.length;
  const mode = remaining <= FINISH_EASY ? 'finish' : 'normal';
  const recent = session.results.map((r) => ({ itemId: r.itemId, correct: r.outcome === 'correct' }));
  session.current = { itemId: selectItem(state, session.clefs, now, rng, recent, mode), shownAt: now };
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
  const target = itemById(q.itemId).note.letter;
  const outcome: Outcome = answer === null ? 'idk' : answer === target ? 'correct' : 'wrong';
  const rtMs = now - q.shownAt;
  const { events } = recordAnswer(state, q.itemId, outcome, answer, rtMs, now);
  session.results.push({ itemId: q.itemId, outcome, rtMs });
  session.events.push(...events);
  session.current = null;
  const lesson = outcome === 'wrong' ? diagnose(state, now) : null;
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
