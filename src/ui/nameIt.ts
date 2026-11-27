// Name It: a note on the staff, answer with its letter. A thin client of the play shell.

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty } from '../core/engine';
import { gradeToken, parseAnswerToken } from '../core/accidentals';
import { hintFor } from '../core/hints';
import { ITEMS, inputStyleOf, isAccidental, itemById } from '../core/items';
import { coreMode } from '../core/modes';
import { type Clef, answerName, displayName, frequency, parseAnswerName } from '../core/music';
import { NAME_IT_MODE } from '../core/session';
import { masteryCounts, renderMasteryKeyboard } from '../render/keyboard';
import { renderStaff } from '../render/staff';
import { clear, h } from './dom';
import { enharmonicFeedback, switchableInput } from './accidentalInput';
import { defineMode } from './mode';
import { type PlayHost, PlayShell } from './playShell';
import { icon } from './world/icons';

export function nameItPlay(host: PlayHost<string>, synth: Synth): PlayShell<string> {
  const promptEl = h('div', { class: 'staff-host' });
  const draw = (itemId: string, opts: Parameters<typeof renderStaff>[2] = {}) => {
    const item = itemById(itemId);
    clear(promptEl);
    promptEl.append(renderStaff(item.note, item.clef, opts));
  };
  return new PlayShell<string>(host, {
    unit: 'keys',
    cardClass: 'staff-card',
    promptEl,
    // Sharps and flats: the pad (spelling) or the 12-key keyboard (the key), as the MODE decides per item.
    // The kid's own switch is off: it would let them pick the one-tap keyboard and never learn to spell.
    input: (onAnswer) =>
      switchableInput({
        label: 'Note names',
        onAnswer,
        target: (id) => answerName(itemById(id).note),
        styleFor: (id) => inputStyleOf(itemById(id)),
        accidentals: () => ITEMS.some((i) => isAccidental(i) && host.session.groups.includes(i.clef) && host.state.items[i.id]?.unlocked),
      }),
    newBadge: '✨ New note! Know it? If not, tap ?',
    correctMs: 700,
    mastered: (state) => {
      const c = masteryCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => draw(id),
    reveal: (id, outcome) => draw(id, { label: displayName(itemById(id).note), state: outcome === 'correct' ? 'correct' : outcome === 'wrong' ? 'wrong' : 'reveal' }),
    play: (id) => synth.note(frequency(itemById(id).note)),
    feedback: ({ itemId, outcome, answer, target, isNew }) => {
      const item = itemById(itemId);
      const hint = hintFor(item.note, item.clef);
      const name = displayName(item.note);
      const given = answer === null ? null : parseAnswerToken(answer)?.name ?? answer;
      const parsed = given === null ? null : parseAnswerName(given);
      const sayGiven = parsed ? displayName({ ...parsed, octave: 4 }) : (given ?? '');
      // The same key under another spelling is wrong on the pad, but gentle: say so, then why.
      const enharmonic = outcome === 'wrong' && answer !== null && gradeToken(answer, target) === 'enharmonic';
      const lead = enharmonic
        ? enharmonicFeedback(answer, target)
        : isNew
          ? `Meet ${name}! ${outcome === 'wrong' ? `(Not ${sayGiven}.) ` : ''}`
          : outcome === 'wrong'
            ? `That one is ${name}, not ${sayGiven}.`
            : `That one is ${name}. Thanks for being honest!`;
      return h(
        'div',
        { class: `hint hint--${outcome}` },
        h('p', { class: 'hint__lead' }, lead, ' ', hint.position),
        hint.accidental && h('p', {}, hint.accidental),
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
export const nameItMode = defineMode<string>({
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
  placement: true,
  placedLine: (id) => {
    const item = itemById(id);
    return `You're starting at ${displayName(item.note)} in the ${item.clef} clef.`;
  },
  itemLabel: (id) => {
    const item = itemById(id);
    return `${displayName(item.note)} (${item.clef} clef)`;
  },
});
