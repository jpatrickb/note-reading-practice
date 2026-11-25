// The A–G + "?" answer pad, shared by Name It, Letter Math and any mode that answers with a letter.

import { LETTERS } from '../core/music';
import { h } from './dom';

/** What the play shell needs from any answer input (a letter pad today; accidentals, words later). */
export interface AnswerInput {
  el: HTMLElement;
  setEnabled(enabled: boolean): void;
  /** Highlight the correct answer; returns its element (for the reaction effects). */
  markRight(answer: string): HTMLElement;
  /** Highlight the student's wrong answer; returns its element. */
  markWrong(answer: string): HTMLElement | null;
  /** Map a key press to an answer: a string, null for "I don't know", undefined for "not mine". */
  fromKey(e: KeyboardEvent): string | null | undefined;
}

const PAD_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export function letterPad(label: string, onAnswer: (answer: string | null) => void): AnswerInput {
  const el = h(
    'div',
    { class: 'pad', role: 'group', 'aria-label': label },
    ...PAD_LETTERS.map((l) => h('button', { class: 'pad__key', 'data-answer': l, onClick: () => onAnswer(l) }, l)),
    h('button', { class: 'pad__key pad__idk', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => onAnswer(null) }, '?'),
  );
  const key = (answer: string) => el.querySelector<HTMLElement>(`[data-answer="${answer}"]`);
  return {
    el,
    setEnabled(enabled) {
      el.querySelectorAll<HTMLButtonElement>('.pad__key').forEach((b) => {
        b.disabled = !enabled;
        if (enabled) b.classList.remove('pad__key--right', 'pad__key--wrong');
      });
    },
    markRight(answer) {
      const b = key(answer)!;
      b.classList.add('pad__key--right');
      return b;
    },
    markWrong(answer) {
      const b = key(answer);
      b?.classList.add('pad__key--wrong');
      return b;
    },
    fromKey(e) {
      const k = e.key.toUpperCase();
      if ((LETTERS as readonly string[]).includes(k)) return k;
      return k === '?' || k === '/' ? null : undefined;
    },
  };
}
