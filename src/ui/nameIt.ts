// Name It: a note on the staff, answer with its letter. A thin client of the play shell.

import type { Synth } from '../audio/synth';
import { hintFor } from '../core/hints';
import { itemById } from '../core/items';
import { type Letter, frequency } from '../core/music';
import { masteryCounts } from '../render/keyboard';
import { renderStaff } from '../render/staff';
import { clear, h } from './dom';
import { letterPad } from './letterPad';
import { type PlayHost, PlayShell } from './playShell';

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
