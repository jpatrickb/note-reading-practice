// Key to Staff: a key lights up on the piano; the kid writes that note on the staff (the tap-a-staff
// input, as in Place It). The piano is the QUESTION here: read-only, the lit key scrolled into view,
// the same one C2–C6 keyboard Note Catcher uses. Middle C keeps its quiet anchor mark: the task is
// writing the note, not finding the key. A thin client of the play shell.

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty, level, recall } from '../core/engine';
import { hintFor } from '../core/hints';
import { KEY_TO_STAFF, KEY_TO_STAFF_KEYBOARD, KEY_TO_STAFF_MODE, answerAt, keyItem, keyLabel, wrongKeyPlacement } from '../core/keyToStaff';
import { coreMode } from '../core/modes';
import { MIDDLE_C } from '../core/noteCatcher';
import { type Clef, frequency, midi, noteId, parseNote, staffPosition } from '../core/music';
import { placeRange } from '../core/placeIt';
import { type StaffInput, createStaffInput } from '../render/staffInput';
import { clear, h } from './dom';
import type { AnswerInput } from './letterPad';
import { defineMode, medalCounts } from './mode';
import { neutralKeyLabels } from './noteCatcher';
import { type Piano, type PianoKey, createPiano, keyName, pianoKeys } from './piano';
import { type PlayHost, PlayShell } from './playShell';
import './placeIt.css';
import './keyToStaff.css';

const CLEFS: Clef[] = ['treble', 'bass'];
const MIDDLE_C_MIDI = midi(parseNote(MIDDLE_C));
const retiredIds = new Set(KEY_TO_STAFF.retired.map((i) => i.id));

/** Medal counts without the retired middle-C items, which are no longer on the map or asked. */
export function keyToStaffCounts(state: StudentState): { gold: number; silver: number } {
  return medalCounts({ ...state, items: Object.fromEntries(Object.entries(state.items).filter(([id]) => !retiredIds.has(id))) });
}

export function keyToStaffPlay(host: PlayHost<string>, synth: Synth): PlayShell<string> {
  const promptEl = h('div', { class: 'k2s-question', 'data-testid': 'k2s-question' });
  const slot = h('div', { class: 'k2s-piano' });
  const ask = h('p', { class: 'k2s-prompt' }, 'Where does this key go on the staff?');
  promptEl.append(ask, slot);
  let current: Clef = 'treble';
  let piano: Piano | null = null;
  let keys: PianoKey[] = [];
  let answerFn: (a: string | null) => void = () => {};

  // One staff per clef, so the input always matches the question's clef; only one is shown.
  const staffs = {} as Record<Clef, StaffInput>;
  for (const clef of CLEFS) {
    const { low, high } = placeRange(clef);
    staffs[clef] = createStaffInput({ clef, lowPos: low, highPos: high, onAnswer: ([pos]) => answerFn(answerAt(pos!, clef)) });
    staffs[clef].el.hidden = clef !== current;
  }
  const idk = h('button', { class: 'place-idk', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => answerFn(null) }, '? I don’t know');

  /** Key names for a screen reader only after the answer: while the question is open they would name the note. */
  const label = (named: boolean, lit: number | null) => {
    const neutral = neutralKeyLabels(keys);
    piano?.el.querySelectorAll<HTMLButtonElement>('.piano__key').forEach((b) => {
      const k = keys.find((key) => key.midi === Number(b.dataset.midi))!;
      b.setAttribute('aria-label', named ? keyName(k) : `${neutral.get(k.midi)!}${k.midi === lit ? ', lit up' : ''}`);
    });
    piano?.el.setAttribute('aria-label', named ? 'Piano keyboard' : 'Piano keys');
  };

  const show = (id: string) => {
    const item = keyItem(id);
    current = item.clef;
    for (const c of CLEFS) staffs[c].el.hidden = c !== item.clef;
    piano?.dispose();
    keys = pianoKeys(KEY_TO_STAFF_KEYBOARD.low, KEY_TO_STAFF_KEYBOARD.high);
    // Keys only make their sound when pressed; they are never an answer here.
    piano = createPiano({
      low: KEY_TO_STAFF_KEYBOARD.low,
      high: KEY_TO_STAFF_KEYBOARD.high,
      labels: 'middleC',
      anchorText: true,
      scroll: true,
      onPress: (_m, noteName) => synth.note(frequency(parseNote(noteName))),
    });
    clear(slot);
    slot.append(piano.el);
    const target = midi(item.note);
    piano.highlight(target);
    // Scroll to show middle C (the anchor) and the lit key together whenever both fit; the lit key wins
    // when they don't. The position depends only on the lit key, never on the kid's answer.
    piano.reveal([target, MIDDLE_C_MIDI], false);
    label(false, target);
  };

  const input = (onAnswer: (a: string | null) => void): AnswerInput<string> => {
    answerFn = onAnswer;
    const el = h('div', { class: 'place-input', 'data-testid': 'k2s-input' }, staffs.treble.el, staffs.bass.el, idk);
    return {
      el,
      setEnabled(enabled) {
        idk.disabled = !enabled;
        // A new question starts from a clean staff (the shell enables the input once per question).
        if (enabled) for (const c of CLEFS) staffs[c].reset();
        else {
          for (const c of CLEFS) staffs[c].setEnabled(false);
          label(true, null);
        }
      },
      markRight(itemId) {
        const item = keyItem(itemId);
        const staff = staffs[item.clef];
        const pos = staffPosition(item.note, item.clef);
        if (staff.placed.includes(pos)) staff.mark(pos, 'right');
        else staff.reveal([pos], item.note.letter);
        return staff.el;
      },
      markWrong(itemId, answer) {
        const item = keyItem(itemId);
        const staff = staffs[item.clef];
        staff.mark(staffPosition(parseNote(answer), item.clef), 'wrong');
        return staff.el;
      },
      // The staff has its own keyboard slider (arrows + Enter); only "?" is handled here.
      fromKey: (e) => (e.key === '?' || e.key === '/' ? { answer: null } : undefined),
      dispose() {
        for (const c of CLEFS) staffs[c].setEnabled(false);
        piano?.dispose();
      },
    };
  };

  return new PlayShell<string>(host, {
    unit: 'notes',
    screenClass: 'place-it key-to-staff',
    cardClass: 'staff-card k2s-card',
    promptEl,
    input,
    newBadge: '✨ New note! Know its spot? If not, tap ?',
    correctMs: 900,
    mastered: (state) => {
      const c = keyToStaffCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: show,
    // The key sounds with the question (it is the question), and again with the answer.
    play: (id) => synth.note(frequency(keyItem(id).note)),
    feedback: ({ itemId, outcome, answer, isNew }) => {
      const item = keyItem(itemId);
      const hint = hintFor(item.note, item.clef);
      const lead = isNew
        ? `Meet ${item.note.letter}! ${outcome === 'wrong' ? `(${wrongKeyPlacement(item, answer!)}) ` : ''}${hint.position}`
        : outcome === 'wrong'
          ? `${wrongKeyPlacement(item, answer!)} ${hint.position}`
          : `That key is ${item.note.letter}. Thanks for being honest! ${hint.position}`;
      return h(
        'div',
        { class: `hint hint--${outcome}` },
        h('p', { class: 'hint__lead' }, lead),
        hint.mnemonic && h('p', {}, '🧠 ', hint.mnemonic),
        h('p', {}, '🧭 ', hint.landmark),
      );
    },
  });
}

/** The Key to Staff progress map: one row of squares per clef, in teaching order. */
export function renderKeyToStaffMap(state: StudentState, now: number, opts: { lanes?: readonly string[] } = {}): HTMLElement {
  const clefs = CLEFS.filter((c) => !opts.lanes || opts.lanes.includes(c));
  return h(
    'div',
    { class: 'place-map', 'data-testid': 'k2s-map' },
    ...clefs.map((clef) =>
      h(
        'div',
        { class: 'place-map__clef' },
        clefs.length > 1 && h('h3', { class: 'map-head' }, clef === 'treble' ? 'Treble clef' : 'Bass clef'),
        h(
          'div',
          { class: 'place-map__cells' },
          ...KEY_TO_STAFF.groups[clef]!.map((item) => {
            const it = state.items[item.id]!;
            const lvl = level(it);
            const dusty = isDusty(it, now);
            const name = noteId(item.note);
            const text = lvl === 'locked' ? 'Coming soon' : `${name} key: ${lvl}${dusty ? ' (needs a polish)' : ''}`;
            return h(
              'span',
              {
                class: `place-cell place-cell--${lvl}${dusty ? ' place-cell--dusty' : ''}`,
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
      ),
    ),
  );
}

/** Key to Staff's registration: its home card, and everything the app needs to play it and show its progress. */
export const keyToStaffMode = defineMode<string>({
  id: 'k2s',
  title: 'Key to Staff',
  icon: 'keyboard',
  blurb: 'See the key, find the spot',
  group: 'keys',
  core: coreMode('k2s'),
  session: KEY_TO_STAFF_MODE,
  lanes: 'clefs',
  words: {
    item: 'note',
    medal: 'note',
    encourage: 'Every practice helps you write what you hear and see. Squares turn silver when you know them well, and gold when you still know them on another day!',
  },
  createPlay: (host, env) => keyToStaffPlay(host, env.synth),
  // Retired middle-C items aren't on the map, so their old medals aren't counted either.
  counts: keyToStaffCounts,
  renderMap: renderKeyToStaffMap,
  itemLabel: keyLabel,
});
