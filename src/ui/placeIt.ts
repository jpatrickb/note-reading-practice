// Place It: "Put a G on the staff". The kid taps a line or space (the tap-a-staff input, D83–D90).
// The reverse of Name It. A thin client of the play shell.

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty, level, recall } from '../core/engine';
import { hintFor } from '../core/hints';
import { coreMode } from '../core/modes';
import { type Clef, frequency } from '../core/music';
import { PLACE_IT, PLACE_IT_MODE, placeItem, placeLabel, placePrompt, placeRange, wrongPlacement } from '../core/placeIt';
import { type StaffInput, createStaffInput } from '../render/staffInput';
import { clear, h } from './dom';
import type { AnswerInput } from './letterPad';
import { defineMode, medalCounts } from './mode';
import { type PlayHost, PlayShell } from './playShell';
import './placeIt.css';

const CLEFS: Clef[] = ['treble', 'bass'];

export function placeItPlay(host: PlayHost<string>, synth: Synth): PlayShell<string> {
  const promptEl = h('div', { class: 'place-question', 'data-testid': 'place-question' });
  let current: Clef = 'treble';
  let answerFn: (a: string | null) => void = () => {};

  // One staff per clef, so the input always matches the question's clef; only one is shown.
  const staffs = {} as Record<Clef, StaffInput>;
  for (const clef of CLEFS) {
    const { low, high } = placeRange(clef);
    staffs[clef] = createStaffInput({ clef, lowPos: low, highPos: high, onAnswer: ([pos]) => answerFn(String(pos)) });
    staffs[clef].el.hidden = clef !== current;
  }
  const idk = h('button', { class: 'place-idk', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => answerFn(null) }, '? I don’t know');

  const showClef = (clef: Clef) => {
    current = clef;
    for (const c of CLEFS) staffs[c].el.hidden = c !== clef;
  };

  const input = (onAnswer: (a: string | null) => void): AnswerInput<string> => {
    answerFn = onAnswer;
    const el = h('div', { class: 'place-input', 'data-testid': 'place-input' }, staffs.treble.el, staffs.bass.el, idk);
    return {
      el,
      setEnabled(enabled) {
        idk.disabled = !enabled;
        // A new question starts from a clean staff (the shell enables the input once per question).
        if (enabled) for (const c of CLEFS) staffs[c].reset();
        else for (const c of CLEFS) staffs[c].setEnabled(false);
      },
      markRight(itemId) {
        const item = placeItem(itemId);
        const staff = staffs[item.clef];
        if (staff.placed.includes(item.pos)) staff.mark(item.pos, 'right');
        else staff.reveal([item.pos], item.note.letter);
        return staff.el;
      },
      markWrong(itemId, answer) {
        const staff = staffs[placeItem(itemId).clef];
        staff.mark(Number(answer), 'wrong');
        return staff.el;
      },
      // The staff has its own keyboard slider (arrows + Enter); only "?" is handled here.
      fromKey: (e) => (e.key === '?' || e.key === '/' ? { answer: null } : undefined),
      dispose() {
        for (const c of CLEFS) staffs[c].setEnabled(false);
      },
    };
  };

  return new PlayShell<string>(host, {
    unit: 'notes',
    screenClass: 'place-it',
    cardClass: 'staff-card place-card',
    promptEl,
    input,
    newBadge: '✨ New note! Know it? If not, tap ?',
    correctMs: 900,
    mastered: (state) => {
      const c = medalCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => {
      const item = placeItem(id);
      const p = placePrompt(item);
      showClef(item.clef);
      clear(promptEl);
      promptEl.dataset.item = item.id;
      promptEl.append(h('p', { class: 'place-prompt' }, `${p.lead} `, h('strong', { class: 'place-letter' }, p.letter), ` ${p.tail}`));
    },
    // The sound comes with the answer, never the question: it must not give the position away.
    play: (id, when) => {
      if (when === 'answer') synth.note(frequency(placeItem(id).note));
    },
    feedback: ({ itemId, outcome, answer, isNew }) => {
      const item = placeItem(itemId);
      const hint = hintFor(item.note, item.clef);
      const lead = isNew
        ? `Meet ${item.note.letter}! ${outcome === 'wrong' ? `(${wrongPlacement(item, Number(answer))}) ` : ''}${hint.position}`
        : outcome === 'wrong'
          ? `${wrongPlacement(item, Number(answer))} ${hint.position}`
          : `${item.note.letter} goes here. Thanks for being honest! ${hint.position}`;
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

/** The Place It progress map: one row of squares per clef, in teaching order, like the other grids. */
export function renderPlaceMap(state: StudentState, now: number, opts: { lanes?: readonly string[] } = {}): HTMLElement {
  const clefs = CLEFS.filter((c) => !opts.lanes || opts.lanes.includes(c));
  return h(
    'div',
    { class: 'place-map', 'data-testid': 'place-map' },
    ...clefs.map((clef) =>
      h(
        'div',
        { class: 'place-map__clef' },
        clefs.length > 1 && h('h3', { class: 'map-head' }, clef === 'treble' ? 'Treble clef' : 'Bass clef'),
        h(
          'div',
          { class: 'place-map__cells' },
          ...PLACE_IT.groups[clef]!.map((item) => {
            const it = state.items[item.id]!;
            const lvl = level(it);
            const dusty = isDusty(it, now);
            const label = lvl === 'locked' ? 'Coming soon' : `${item.note.letter}: ${lvl}${dusty ? ' (needs a polish)' : ''}`;
            return h(
              'span',
              {
                class: `place-cell place-cell--${lvl}${dusty ? ' place-cell--dusty' : ''}`,
                'data-item': item.id,
                'data-level': lvl,
                role: 'img',
                'aria-label': label,
                title: label,
                style: lvl === 'learning' ? `--fill: ${Math.round(100 * recall(it, now))}%` : undefined,
              },
              lvl === 'locked' ? '' : item.note.letter,
            );
          }),
        ),
      ),
    ),
  );
}

/** Place It's registration: its home card, and everything the app needs to play it and show its progress. */
export const placeItMode = defineMode<string>({
  id: 'place',
  title: 'Place It',
  icon: 'note',
  blurb: 'Put the named note on the staff',
  group: 'read',
  core: coreMode('place'),
  session: PLACE_IT_MODE,
  lanes: 'clefs',
  words: {
    item: 'note',
    medal: 'note',
    encourage: 'Every practice makes your notes stronger. Squares turn silver when you know them well, and gold when you still know them on another day!',
  },
  createPlay: (host, env) => placeItPlay(host, env.synth),
  renderMap: renderPlaceMap,
  itemLabel: placeLabel,
});
