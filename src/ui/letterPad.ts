// The A–G + "?" answer pad, shared by Name It, Letter Math and any mode that answers with a letter.

import type { Letter } from '../core/music';
import { h } from './dom';

/** What the play shell needs from any answer input (a letter pad today; accidentals, words later). */
export interface AnswerInput<A extends string = string> {
  el: HTMLElement;
  setEnabled(enabled: boolean): void;
  /** Called with the item just before it is asked (optional): an input that varies per item (pad or keys) reads it here. */
  ask?(itemId: string): void;
  /** Highlight the right answer for this item; returns the element to react on, if there is one. */
  markRight(itemId: string): HTMLElement | null;
  /** Highlight the student's wrong answer; returns its element, if there is one. */
  markWrong(itemId: string, answer: A): HTMLElement | null;
  /**
   * Map a key press to an answer: `{ answer }` (null is "I don't know"), `'handled'` when the input
   * used the key but is not done (e.g. F, then #), or undefined when the key is not its own.
   */
  fromKey(e: KeyboardEvent): { answer: A | null } | 'handled' | undefined;
  /** Remove listeners and stop sounds when the play screen closes. */
  dispose?(): void;
}

const PAD_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

/** The A–G + "?" pad. `target` says which letter is right for an item. */
export function letterPad(label: string, onAnswer: (answer: Letter | null) => void, target: (itemId: string) => Letter): AnswerInput<Letter> {
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
    markRight(itemId) {
      const b = key(target(itemId));
      b?.classList.add('pad__key--right');
      return b;
    },
    markWrong(_itemId, answer) {
      const b = key(answer);
      b?.classList.add('pad__key--wrong');
      return b;
    },
    fromKey(e) {
      const k = e.key.toUpperCase();
      if ((PAD_LETTERS as readonly string[]).includes(k)) return { answer: k as Letter };
      return k === '?' || k === '/' ? { answer: null } : undefined;
    },
  };
}
