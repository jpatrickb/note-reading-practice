// Letter Math screens: the play flow and the mastery grid. Same feel as Name It: A–G pad + "?",
// correct answers auto-advance, wrong/"?" show the letter walk and wait for "Got it".

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty, level, recall } from '../core/engine';
import {
  answerSentence,
  letterHint,
  letterItem,
  letterNotes,
  prompt,
  rungRows,
  rungTitle,
} from '../core/letters';
import { type Letter, frequency } from '../core/music';
import { clear, h } from './dom';
import { letterPad } from './letterPad';
import { type PlayHost, PlayShell } from './playShell';
import { icon } from './world/icons';
import './letterMath.css';

export function letterMathPlay(host: PlayHost<Letter>, synth: Synth): PlayShell<Letter> {
  const promptEl = h('div', { class: 'lm-question', 'data-testid': 'lm-question' });
  return new PlayShell<Letter>(host, {
    unit: 'skills',
    screenClass: 'letter-math',
    cardClass: 'staff-card lm-card',
    promptEl,
    input: (onAnswer) => letterPad('Letter names', onAnswer, (id) => host.session.mode.engine.answerOf(id)),
    newBadge: '✨ New question! Know it? If not, tap ?',
    correctMs: 1000,
    praiseTarget: true,
    mastered: (state) => {
      const c = letterCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => {
      const item = letterItem(id);
      const p = prompt(item);
      clear(promptEl);
      promptEl.dataset.item = item.id;
      promptEl.append(h('p', { class: 'lm-prompt' }, `${p.lead} `, h('strong', { class: 'lm-letter' }, p.letter), p.tail));
    },
    /** Relative-pitch ear training for free: the start note, then the answer note. */
    play: (id, when) => {
      if (when === 'ask') return;
      const [a, b] = letterNotes(letterItem(id));
      synth.note(frequency(a), 0, 0.9);
      synth.note(frequency(b), 0.5, 1.2);
    },
    feedback: ({ itemId, outcome, answer, isNew }) => {
      const item = letterItem(itemId);
      const hint = letterHint(item);
      const sentence = answerSentence(item);
      const lead = isNew
        ? `Here's a new one! ${outcome === 'wrong' ? `(Not ${answer}.) ` : ''}${sentence}`
        : outcome === 'wrong'
          ? `Not ${answer}. ${sentence}`
          : `${sentence} Thanks for being honest!`;
      const last = hint.walk.length - 1;
      return h(
        'div',
        { class: `hint hint--${outcome}` },
        h('p', { class: 'hint__lead' }, lead),
        h(
          'ol',
          { class: 'lm-walk', 'aria-label': 'Letter walk' },
          ...hint.walk.map((s, i) =>
            h(
              'li',
              { class: `lm-step${i === 0 ? ' lm-step--start' : ''}${i === last ? ' lm-step--end' : ''}${s.skipped ? ' lm-step--skipped' : ''}` },
              s.letter,
              s.n !== undefined && h('small', {}, String(s.n)),
            ),
          ),
        ),
        ...hint.lines.map((line) => h('p', {}, line)),
      );
    },
  });
}

/** Gold/silver counts for Letter Math. */
export function letterCounts(state: StudentState): { gold: number; silver: number } {
  const counts = { gold: 0, silver: 0 };
  for (const it of Object.values(state.items)) {
    const l = level(it);
    if (l === 'gold' || l === 'silver') counts[l]++;
  }
  return counts;
}

/**
 * The Letter Math mastery map: one row of 7 squares (start letters A–G) per skill that has opened.
 * Squares fill blue while learning, then turn silver and gold, like the keys on the keyboard.
 */
export function renderLetterMap(state: StudentState, now: number): HTMLElement {
  const rows = rungRows();
  const open = rows.filter((r) => r.items.some((i) => state.items[i.id]!.unlocked));
  const later = rows.length - open.length;
  return h(
    'div',
    { class: 'lm-map', 'data-testid': 'letter-map' },
    ...open.map(({ rung, items }) =>
      h(
        'div',
        { class: 'lm-row' },
        h('span', { class: 'lm-row__title' }, rungTitle(rung)),
        h(
          'span',
          { class: 'lm-row__cells' },
          ...items.map((item) => {
            const it = state.items[item.id]!;
            const lvl = level(it);
            const dusty = isDusty(it, now);
            const label = `${answerSentence(item)} ${lvl === 'locked' ? 'Coming soon' : lvl}${dusty ? ' (needs a polish)' : ''}`;
            return h(
              'span',
              {
                class: `lm-cell lm-cell--${lvl}${dusty ? ' lm-cell--dusty' : ''}`,
                'data-item': item.id,
                'data-level': lvl,
                role: 'img',
                'aria-label': lvl === 'locked' ? 'Coming soon' : label,
                title: lvl === 'locked' ? 'Coming soon' : label,
                style: lvl === 'learning' ? `--fill: ${Math.round(100 * recall(it, now))}%` : undefined,
              },
              lvl === 'locked' ? '' : item.start,
            );
          }),
        ),
      ),
    ),
    later > 0 && h('p', { class: 'muted lm-map__later' }, icon('lock', 'lm-map__lock'), `${later} more skill${later > 1 ? 's' : ''} to unlock as you go.`),
  );
}
