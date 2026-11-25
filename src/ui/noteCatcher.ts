// Note Catcher: a note on the staff, tap its exact key on the on-screen piano. A thin client of the
// play shell. The piano never gives the answer away: no letters on the keys, and while a question is
// open its keys are announced by position only ("Piano key 5 of 17"), not by name (see neutralKeyLabels).

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty, level, recall } from '../core/engine';
import { hintFor } from '../core/hints';
import { coreMode } from '../core/modes';
import { type Clef, frequency, midi, noteId, parseNote } from '../core/music';
import {
  BLACK_KEY_TIP,
  CATCHER_RANGE,
  type CatchItem,
  NOTE_CATCHER,
  NOTE_CATCHER_MODE,
  catchItem,
  keyWindow,
  missText,
  whereIs,
} from '../core/noteCatcher';
import { renderStaff } from '../render/staff';
import { clear, h } from './dom';
import type { AnswerInput } from './letterPad';
import { defineMode, medalCounts } from './mode';
import { type Piano, type PianoKey, createPiano, keyName, pianoKeys } from './piano';
import { type PlayHost, PlayShell } from './playShell';
import './letterMath.css';
import './noteCatcher.css';

const MIN_KEY_PX = 44;
const APP_COLUMN_PX = 960;
const GUTTER_PX = 32;

/** How many white keys fit at ≥ 44px on this screen (the app column is at most 960px wide). */
export function whiteKeysThatFit(viewportWidth: number): number {
  return Math.floor((Math.min(viewportWidth, APP_COLUMN_PX) - GUTTER_PX) / MIN_KEY_PX);
}

/**
 * What a screen reader hears for a key WHILE A QUESTION IS OPEN: its place on the keyboard, never its
 * name. A name would answer "which key is G?", which is exactly what this mode teaches. After the
 * answer every key gets its real name back.
 */
export function neutralKeyLabels(keys: readonly PianoKey[]): Map<number, string> {
  const whites = keys.filter((k) => !k.black).length;
  const labels = new Map<number, string>();
  for (const k of keys) {
    labels.set(k.midi, k.black ? `Black key after white key ${k.white + 1}` : `Piano key ${k.white + 1} of ${whites}`);
  }
  return labels;
}

interface CatcherInput extends AnswerInput<string> {
  /** Build the piano for this question. */
  show(item: CatchItem): void;
  /** The key pressed for the current question (null: none, or "?"). */
  given(): string | null;
}

function catcherInput(synth: Synth, onAnswer: (answer: string | null) => void, targetOf: (id: string) => string): CatcherInput {
  let piano: Piano | null = null;
  let keys: PianoKey[] = [];
  let given: string | null = null;
  let open = true;
  const slot = h('div', { class: 'catcher-input__piano' });
  const idk = h('button', { class: 'pad__key pad__idk catcher__idk', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => answer(null) }, '?');
  const tip = h('p', { class: 'catcher__tip', role: 'status', 'data-testid': 'catcher-tip' });
  const el = h('div', { class: 'catcher-input', role: 'group', 'aria-label': 'Answer with a piano key' }, slot, tip, idk);

  const label = (named: boolean) => {
    const neutral = neutralKeyLabels(keys);
    piano?.el.querySelectorAll<HTMLButtonElement>('.piano__key').forEach((b) => {
      const k = keys.find((key) => key.midi === Number(b.dataset.midi))!;
      b.setAttribute('aria-label', named ? keyName(k) : neutral.get(k.midi)!);
    });
    piano?.el.setAttribute('aria-label', named ? 'Piano keyboard' : 'Piano keys');
  };

  /** After the answer: the landmark dot on middle C, as the piano's own 'middleC' label draws it. */
  function showMiddleC() {
    const c4 = piano?.el.querySelector<HTMLElement>('[data-note="C4"]');
    if (!c4 || c4.querySelector('.piano__dot')) return;
    const dot = h('span', { class: 'piano__dot', 'aria-hidden': 'true' });
    c4.prepend(dot);
  }

  function answer(a: string | null) {
    if (!open) return;
    // A black key is never an answer here: say so, with no score, and let the kid tap again.
    if (a !== null && parseNote(a).acc) {
      tip.textContent = BLACK_KEY_TIP;
      synth.note(frequency(parseNote(a)));
      return;
    }
    tip.textContent = '';
    given = a;
    // The pressed key sounds at once (D4); the shell then plays the right one after a miss.
    if (a !== null) synth.note(frequency(parseNote(a)));
    onAnswer(a);
  }

  return {
    el,
    given: () => given,
    /** Rebuild the piano for the question: the clef's whole range, or a window of it on a narrow screen. */
    show(item) {
      piano?.dispose();
      const range = keyWindow(CATCHER_RANGE[item.clef], item.note, whiteKeysThatFit(window.innerWidth), Math.random());
      keys = pianoKeys(range.low, range.high);
      // No middle-C dot while the question is open: it would mark every C4 answer (and its absence would
      // mark C4 by elimination). The dot appears with the answer, as a landmark (see setEnabled).
      piano = createPiano({ low: range.low, high: range.high, labels: 'none', onPress: (_m, id) => answer(id) });
      clear(slot);
      slot.append(piano.el);
      given = null;
      tip.textContent = '';
      label(false);
    },
    setEnabled(enabled) {
      open = enabled;
      idk.disabled = !enabled;
      piano?.setEnabled(enabled);
      if (enabled) {
        piano?.clearMarks();
        label(false);
      } else {
        label(true);
        showMiddleC();
      }
    },
    markRight(itemId) {
      const target = targetOf(itemId);
      // Right: a check. Otherwise the right key is shown as the target, next to the wrong one.
      piano?.mark(midi(parseNote(target)), given === target ? 'right' : 'target');
      return piano?.el.querySelector<HTMLElement>(`[data-note="${target}"]`) ?? null;
    },
    markWrong(_itemId, ans) {
      piano?.mark(midi(parseNote(ans)), 'wrong');
      return piano?.el.querySelector<HTMLElement>(`[data-note="${ans}"]`) ?? null;
    },
    fromKey(e) {
      // Letters can't pick an octave, so the keys themselves are focusable (arrows, Enter/Space).
      return e.key === '?' || e.key === '/' ? { answer: null } : undefined;
    },
    dispose() {
      piano?.dispose();
    },
  };
}

export function noteCatcherPlay(host: PlayHost<string>, synth: Synth): PlayShell<string> {
  const promptEl = h('div', { class: 'staff-host' });
  const draw = (itemId: string, opts: Parameters<typeof renderStaff>[2] = {}) => {
    const item = catchItem(itemId);
    clear(promptEl);
    promptEl.append(renderStaff(item.note, item.clef, opts));
  };
  let input: CatcherInput | null = null;
  return new PlayShell<string>(host, {
    unit: 'keys',
    screenClass: 'note-catcher',
    cardClass: 'staff-card',
    promptEl,
    input: (onAnswer) => (input = catcherInput(synth, onAnswer, (id) => host.session.mode.engine.answerOf(id))),
    newBadge: '✨ New note! Know its key? If not, tap ?',
    correctMs: 700,
    mastered: (state) => {
      const c = medalCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => {
      draw(id);
      input?.show(catchItem(id));
    },
    reveal: (id, outcome) => draw(id, { label: catchItem(id).note.letter, state: outcome === 'correct' ? 'correct' : outcome === 'wrong' ? 'wrong' : 'reveal' }),
    // Nothing sounds when the question appears (the sound would give the key away by ear). The
    // pressed key sounds when pressed; after a miss or "?" the right key sounds too.
    play: (id, when) => {
      if (when !== 'answer') return;
      const target = noteId(catchItem(id).note);
      const given = input?.given() ?? null;
      if (given !== target) synth.note(frequency(parseNote(target)), given === null ? 0 : 0.45, 1.2);
    },
    feedback: ({ itemId, outcome, answer, isNew }) => {
      const item = catchItem(itemId);
      const hint = hintFor(item.note, item.clef);
      const letter = item.note.letter;
      const fresh = isNew ? "Here's a new one! " : '';
      const lead =
        outcome === 'wrong'
          ? `${fresh}${missText(item, answer!)}`
          : `${fresh}This note is ${letter}. ${isNew ? '' : 'Thanks for being honest! '}This ${letter} is ${whereIs(item.note)}.`;
      return h(
        'div',
        { class: `hint hint--${outcome}` },
        h('p', { class: 'hint__lead' }, lead),
        h('p', {}, hint.position),
        hint.mnemonic && h('p', {}, '🧠 ', hint.mnemonic),
        h('p', {}, '🧭 ', hint.landmark),
      );
    },
  });
}

/** The Note Catcher progress map: one row of squares per clef, low to high, labelled like the keys. */
export function renderCatcherMap(state: StudentState, now: number, opts: { lanes?: readonly string[] } = {}): HTMLElement {
  const clefs = (['treble', 'bass'] as Clef[]).filter((c) => !opts.lanes || opts.lanes.includes(c));
  return h(
    'div',
    { class: 'lm-map', 'data-testid': 'catcher-map' },
    ...clefs.map((clef) => {
      const items = [...NOTE_CATCHER.groups[clef]!].sort((a, b) => midi(a.note) - midi(b.note));
      return h(
        'div',
        { class: 'lm-row' },
        h('span', { class: 'lm-row__title' }, clef === 'treble' ? 'Treble clef' : 'Bass clef'),
        h(
          'span',
          { class: 'lm-row__cells' },
          ...items.map((item) => {
            const it = state.items[item.id]!;
            const lvl = level(it);
            const dusty = isDusty(it, now);
            const name = noteId(item.note);
            const text = lvl === 'locked' ? 'Coming soon' : `${name} key: ${lvl}${dusty ? ' (needs a polish)' : ''}`;
            return h(
              'span',
              {
                class: `lm-cell lm-cell--${lvl}${dusty ? ' lm-cell--dusty' : ''}`,
                'data-item': item.id,
                'data-level': lvl,
                role: 'img',
                'aria-label': text,
                title: text,
                style: lvl === 'learning' ? `--fill: ${Math.round(100 * recall(it, now))}%` : undefined,
              },
              lvl === 'locked' ? '' : name,
            );
          }),
        ),
      );
    }),
  );
}

/** Note Catcher's registration: its home card, and everything the app needs to play it and show its progress. */
export const noteCatcherMode = defineMode<string>({
  id: 'catch',
  title: 'Note Catcher',
  icon: 'keyboard',
  blurb: 'See the note, tap the key',
  group: 'keys',
  core: coreMode('catch'),
  session: NOTE_CATCHER_MODE,
  lanes: 'clefs',
  words: {
    item: 'note',
    medal: 'key',
    encourage: 'Every practice helps your fingers find the notes. Keys turn silver when you know them well, and gold when you still know them on another day!',
  },
  createPlay: (host, env) => noteCatcherPlay(host, env.synth),
  renderMap: renderCatcherMap,
  itemLabel: (id) => {
    const item = catchItem(id);
    return `${noteId(item.note)} key (${item.clef} clef)`;
  },
});
