// Accidental answers, pure (no DOM): the answer TOKEN that carries the input style ('pad:Db' / 'keys:C#') and its
// grading, so a mode's engine can judge an answer with no input around. The pad's answer must match the written
// spelling; the keyboard's is judged by pitch. See src/ui/accidentalInput.ts for the inputs themselves.

import { type Accidental, type AnswerName, type Letter, displayName, midi, parseAnswerName } from './music';

export type InputStyle = 'pad' | 'keys';

/** What these inputs answer: the style, then the octave-less note name. 'pad:Db', 'keys:C#'. */
export type AccidentalAnswer = `${InputStyle}:${AnswerName}`;

export const answerToken = (style: InputStyle, name: AnswerName): AccidentalAnswer => `${style}:${name}`;

/** Splits a token; null for anything that isn't one (including a bare note name). */
export function parseAnswerToken(token: string): { style: InputStyle; name: AnswerName; letter: Letter; acc: Accidental } | null {
  const m = /^(pad|keys):(.+)$/.exec(token);
  const p = m ? parseAnswerName(m[2]!) : null;
  return m && p ? { style: m[1] as InputStyle, name: m[2] as AnswerName, letter: p.letter, acc: p.acc } : null;
}

/** Grading of an accidental answer: 'enharmonic' is the right key under another spelling (it counts as wrong). */
export type AccidentalGrade = 'correct' | 'enharmonic' | 'wrong';

export const pitchClassOf = (p: { letter: Letter; acc: Accidental }) => midi({ letter: p.letter, octave: 4, acc: p.acc }) % 12;

/** `pad`: the spelling must match. `keys`: the pitch must match (a key has no spelling). */
export function gradeAccidental(style: InputStyle, answer: string, target: string): AccidentalGrade {
  const a = parseAnswerName(answer);
  const t = parseAnswerName(target);
  if (!a || !t) return 'wrong';
  const samePitch = pitchClassOf(a) === pitchClassOf(t);
  if (style === 'keys') return samePitch ? 'correct' : 'wrong';
  if (a.letter === t.letter && a.acc === t.acc) return 'correct';
  return samePitch ? 'enharmonic' : 'wrong';
}

/** Pure grading of an answer token against the spelled target ('Db'): the helper for a mode's isCorrect/grade. */
export function gradeToken(token: string, target: string): AccidentalGrade {
  const t = parseAnswerToken(token);
  return t ? gradeAccidental(t.style, t.name, target) : 'wrong';
}

const shown = (name: string) => {
  const p = parseAnswerName(name);
  return p ? displayName({ letter: p.letter, octave: 4, acc: p.acc }) : name;
};

/** Gentle wording for an enharmonic answer: same key, different name. */
export function enharmonicFeedback(answer: string, target: string): string {
  const a = parseAnswerToken(answer)?.name ?? answer;
  return `${shown(a)} and ${shown(target)} are the same key with different names. This note is written as ${shown(target)}.`;
}

