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
  MIDDLE_C,
  NOTE_CATCHER,
  NOTE_CATCHER_MODE,
  catchItem,
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

/**
 * What a screen reader hears for a key WHILE A QUESTION IS OPEN: its place on the keyboard, never its
 * name. A name would answer "which key is G?", which is exactly what this mode teaches. After the
 * answer every key gets its real name back.
 */
export function neutralKeyLabels(keys: readonly PianoKey[]): Map<number, string> {
  const whites = keys.filter((k) => !k.black).length;
  const labels = new Map<number, string>();
  for (const k of keys) {
    // Middle C is the one named key: it is the marked anchor, and never a question.
    labels.set(k.midi, k.black ? `Black key after white key ${k.white + 1}` : `Piano key ${k.white + 1} of ${whites}${k.id === MIDDLE_C ? ', middle C' : ''}`);
  }
  return labels;
}

const retiredIds = new Set(NOTE_CATCHER.retired.map((i) => i.id));

/** Medal counts without the retired middle-C items, which are no longer on the map or asked. */
export function catcherCounts(state: StudentState): { gold: number; silver: number } {
  return medalCounts({ ...state, items: Object.fromEntries(Object.entries(state.items).filter(([id]) => !retiredIds.has(id))) });
}

interface CatcherInput extends AnswerInput<string> {
  /** Build the piano for this question. */
  show(): void;
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
    /**
     * Rebuild the piano for the question. It is always the same one keyboard, whatever the clef, and
     * always starts centered on middle C, so where it is scrolled says nothing about the answer.
     */
    show() {
      piano?.dispose();
      keys = pianoKeys(CATCHER_RANGE.low, CATCHER_RANGE.high);
      // Middle C is marked all the time (C4 is never asked, so the mark is no clue); no other key shows anything.
      piano = createPiano({ low: CATCHER_RANGE.low, high: CATCHER_RANGE.high, labels: 'middleC', anchorText: true, scroll: true, onPress: (_m, id) => answer(id) });
      clear(slot);
      slot.append(piano.el);
      piano.reveal([midi(parseNote(MIDDLE_C))], false);
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
      }
    },
    markRight(itemId) {
      const target = targetOf(itemId);
      // Right: a check. Otherwise the right key is shown as the target, next to the wrong one.
      piano?.mark(midi(parseNote(target)), given === target ? 'right' : 'target');
      // After a miss or "?", bring the right key (and the tapped one, if any) into view together.
      if (given !== target) piano?.reveal([midi(parseNote(target)), ...(given ? [midi(parseNote(given))] : [])], true);
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
      const c = catcherCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => {
      draw(id);
      input?.show();
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
  // Retired middle-C items aren't on the map, so their old medals aren't counted in the pill or the weekly goal either.
  counts: catcherCounts,
  renderMap: renderCatcherMap,
  itemLabel: (id) => {
    const item = catchItem(id);
    return `${noteId(item.note)} key (${item.clef} clef)`;
  },
  // 16 keys per clef, so a knower can place high (D63). The round marks nothing: the pressed key
  // sounds as it does in play (its own pitch, which says nothing about right or wrong).
  placement: true,
  placedLine: (id) => {
    const item = catchItem(id);
    return `You're starting at the ${noteId(item.note)} key in the ${item.clef} clef.`;
  },
});
