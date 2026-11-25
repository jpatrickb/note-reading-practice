// Name It: a note on the staff, answer with its letter. A thin client of the play shell.

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty } from '../core/engine';
import { hintFor } from '../core/hints';
import { ITEMS, itemById } from '../core/items';
import { coreMode } from '../core/modes';
import { type Clef, type Letter, frequency } from '../core/music';
import { NAME_IT_MODE } from '../core/session';
import { masteryCounts, renderMasteryKeyboard } from '../render/keyboard';
import { renderStaff } from '../render/staff';
import { clear, h } from './dom';
import { letterPad } from './letterPad';
import { defineMode } from './mode';
import { type PlayHost, PlayShell } from './playShell';
import { icon } from './world/icons';

export function nameItPlay(host: PlayHost<Letter>, synth: Synth): PlayShell<Letter> {
  const promptEl = h('div', { class: 'staff-host' });
  const draw = (itemId: string, opts: Parameters<typeof renderStaff>[2] = {}) => {
    const item = itemById(itemId);
    clear(promptEl);
    promptEl.append(renderStaff(item.note, item.clef, opts));
  };
  return new PlayShell<Letter>(host, {
    unit: 'keys',
    cardClass: 'staff-card',
    promptEl,
    input: (onAnswer) => letterPad('Note names', onAnswer, (id) => host.session.mode.engine.answerOf(id)),
    newBadge: '✨ New note! Know it? If not, tap ?',
    correctMs: 700,
    mastered: (state) => {
      const c = masteryCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => draw(id),
    reveal: (id, outcome, target) => draw(id, { label: target, state: outcome === 'correct' ? 'correct' : outcome === 'wrong' ? 'wrong' : 'reveal' }),
    play: (id) => synth.note(frequency(itemById(id).note)),
    feedback: ({ itemId, outcome, answer, target, isNew }) => {
      const item = itemById(itemId);
      const hint = hintFor(item.note, item.clef);
      const lead = isNew
        ? `Meet ${target}! ${outcome === 'wrong' ? `(Not ${answer}.) ` : ''}`
        : outcome === 'wrong'
          ? `That one is ${target}, not ${answer}.`
          : `That one is ${target}. Thanks for being honest!`;
      return h(
        'div',
        { class: `hint hint--${outcome}` },
        h('p', { class: 'hint__lead' }, lead, ' ', hint.position),
        hint.mnemonic && h('p', {}, '🧠 ', hint.mnemonic),
        h('p', {}, '🧭 ', hint.landmark),
      );
    },
  });
}

/** The Name It progress map: the mastery keyboard of each clef and, in My progress, a legend. */
export function renderNameItMap(state: StudentState, now: number, opts: { lanes?: readonly string[]; legend?: boolean } = {}): HTMLElement {
  const clefs = (['treble', 'bass'] as Clef[]).filter((c) => !opts.lanes || opts.lanes.includes(c));
  const counts = masteryCounts(state);
  const dusty = ITEMS.filter((i) => isDusty(state.items[i.id]!, now)).length;
  return h(
    'div',
    { class: 'name-map', 'data-testid': 'name-map' },
    ...clefs.map((c) =>
      h(
        'div',
        { class: 'name-map__clef' },
        clefs.length > 1 && h('h3', { class: 'map-head' }, c === 'treble' ? 'Treble clef' : 'Bass clef'),
        h('div', { class: 'keys-frame' }, renderMasteryKeyboard(state, c, now)),
      ),
    ),
    opts.legend &&
      h(
        'div',
        { class: 'legend' },
        h('span', {}, h('i', { class: 'sw sw--gold' }), `Gold ${counts.gold}: you still knew it on another day`),
        h('span', {}, h('i', { class: 'sw sw--silver' }), `Silver ${counts.silver}: you know it fast`),
        h('span', {}, h('i', { class: 'sw sw--learning' }), `Learning ${counts.learning}: the bar grows as you learn`),
        h('span', {}, h('i', { class: 'sw sw--locked' }), `Coming soon ${counts.locked}`),
        dusty > 0 && h('span', {}, icon('sparkle', 'legend__icon'), `${dusty} key${dusty > 1 ? 's' : ''} could use a polish. Practice to make ${dusty > 1 ? 'them' : 'it'} shine again!`),
      ),
  );
}

/** Name It's registration: its home card, and everything the app needs to play it and show its progress. */
export const nameItMode = defineMode<Letter>({
  id: 'name',
  title: 'Name It',
  icon: 'note',
  blurb: 'Read the note, tap its name',
  group: 'read',
  core: coreMode('name'),
  session: NAME_IT_MODE,
  lanes: 'clefs',
  words: {
    item: 'note',
    medal: 'key',
    encourage: 'Every practice makes your notes stronger. Keys turn silver when you know them well, and gold when you still know them on another day!',
  },
  createPlay: (host, env) => nameItPlay(host, env.synth),
  renderMap: renderNameItMap,
  itemLabel: (id) => {
    const item = itemById(id);
    return `${item.note.letter} (${item.clef} clef)`;
  },
});
