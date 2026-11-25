// Letter Math screens: the play flow and the mastery grid. Same feel as Name It: A–G pad + "?",
// correct answers auto-advance, wrong/"?" show the letter walk and wait for "Got it".

import type { Synth } from '../audio/synth';
import { type MasteryEvent, type StudentState, isDusty, level, recall } from '../core/engine';
import {
  answerSentence,
  letterAnswer,
  letterHint,
  letterItem,
  letterNotes,
  prompt,
  rungRows,
  rungTitle,
} from '../core/letters';
import { LETTERS, type Letter, frequency } from '../core/music';
import { type Session, isFinished, nextQuestion, submit } from '../core/session';
import { clear, h } from './dom';
import { icon } from './world/icons';
import { type Medal, PlayChrome, praise } from './world/playChrome';
import './letterMath.css';

export interface LetterPlayHost {
  session: Session;
  state: StudentState;
  synth: Synth;
  now(): number;
  save(): void;
  announce(events: MasteryEvent[]): void;
  muteButton(): HTMLElement;
  quit(): void;
  finish(): void;
}

export class LetterMathPlay {
  private phase: 'asking' | 'feedback' = 'asking';
  private timer = 0;
  private isNew = false;
  private el!: HTMLElement;
  private chrome!: PlayChrome;

  constructor(private readonly host: LetterPlayHost) {}

  render(): HTMLElement {
    const { session } = this.host;
    const pad = h(
      'div',
      { class: 'pad', role: 'group', 'aria-label': 'Letter names' },
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) =>
        h('button', { class: 'pad__key', 'data-answer': l, onClick: () => this.answer(l as Letter) }, l),
      ),
      h('button', { class: 'pad__key pad__idk', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => this.answer(null) }, '?'),
    );
    const counts = letterCounts(this.host.state);
    this.chrome = new PlayChrome({
      length: session.length,
      mastered: counts.gold + counts.silver,
      onQuit: () => this.host.quit(),
      mute: this.host.muteButton(),
      unit: 'skills',
    });
    this.el = h(
      'main',
      { class: 'screen play letter-math' },
      this.chrome.topbar,
      h('div', { class: 'staff-card lm-card' }, h('div', { class: 'banner' }), h('div', { class: 'lm-question', 'data-testid': 'lm-question' })),
      this.chrome.coach,
      pad,
    );
    queueMicrotask(() => this.ask());
    return this.el;
  }

  dispose(): void {
    window.clearTimeout(this.timer);
  }

  private q<T extends Element = HTMLElement>(sel: string): T {
    return this.el.querySelector(sel) as T;
  }

  private active(): boolean {
    return this.el.isConnected;
  }

  private setPadEnabled(enabled: boolean): void {
    this.el.querySelectorAll<HTMLButtonElement>('.pad__key').forEach((b) => {
      b.disabled = !enabled;
      if (enabled) b.classList.remove('pad__key--right', 'pad__key--wrong');
    });
  }

  private ask(): void {
    if (!this.active()) return;
    const { session, state } = this.host;
    const qn = nextQuestion(session, state, this.host.now(), Math.random);
    const item = letterItem(qn.itemId);
    clear(this.q('.feedback'));
    const banner = this.q('.banner');
    clear(banner);
    // First appearance: quiz right away (pretesting). "?" or a miss teaches it (decision D35).
    this.isNew = state.items[qn.itemId]!.n === 0;
    if (this.isNew) banner.append(h('span', { class: 'badge' }, '✨ New question! Know it? If not, tap ?'));
    const p = prompt(item);
    const host = this.q('.lm-question');
    clear(host);
    host.dataset.item = item.id;
    host.append(h('p', { class: 'lm-prompt' }, `${p.lead} `, h('strong', { class: 'lm-letter' }, p.letter), p.tail));
    this.phase = 'asking';
    this.setPadEnabled(true);
    this.chrome.asking(session.results.length, this.q('.lm-card'));
  }

  /** Relative-pitch ear training for free: the start note, then the answer note. */
  private play(itemId: string): void {
    const [a, b] = letterNotes(letterItem(itemId));
    this.host.synth.note(frequency(a), 0, 0.9);
    this.host.synth.note(frequency(b), 0.5, 1.2);
  }

  answer(letter: Letter | null): void {
    const { session, state } = this.host;
    if (!this.active() || this.phase !== 'asking' || !session.current) return;
    const item = letterItem(session.current.itemId);
    const res = submit(session, state, letter, this.host.now());
    this.host.save();
    this.phase = 'feedback';
    this.setPadEnabled(false);

    const target = letterAnswer(item);
    const targetBtn = this.q(`[data-answer="${target}"]`);
    targetBtn.classList.add('pad__key--right');
    const wrongBtn = res.outcome === 'wrong' ? this.q(`[data-answer="${letter}"]`) : null;
    wrongBtn?.classList.add('pad__key--wrong');
    this.play(item.id);
    this.host.announce(res.events);
    const medal: Medal = res.events.some((e) => e.kind === 'gold') ? 'gold' : res.events.some((e) => e.kind === 'silver') ? 'silver' : null;
    this.chrome.react(res.outcome, session.results.length, targetBtn, wrongBtn, medal, target);

    if (res.outcome === 'correct') {
      this.q('.feedback').append(praise(medal, target));
      this.timer = window.setTimeout(() => this.advance(), medal ? 1600 : 1000);
      return;
    }

    const hint = letterHint(item);
    const sentence = answerSentence(item);
    const lead = this.isNew
      ? `Here's a new one! ${res.outcome === 'wrong' ? `(Not ${letter}.) ` : ''}${sentence}`
      : res.outcome === 'wrong'
        ? `Not ${letter}. ${sentence}`
        : `${sentence} Thanks for being honest!`;
    const last = hint.walk.length - 1;
    this.q('.feedback').append(
      h(
        'div',
        { class: `hint hint--${res.outcome}` },
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
        h('button', { class: 'primary', 'data-testid': 'continue', onClick: () => this.advance() }, 'Got it →'),
      ),
    );
    this.q<HTMLElement>('[data-testid=continue]').focus();
  }

  private advance(): void {
    if (!this.active() || this.phase !== 'feedback') return;
    window.clearTimeout(this.timer);
    if (isFinished(this.host.session)) return this.host.finish();
    this.ask();
  }

  /** Desktop typing: A–G answers, "?" or "/" for I don't know, Enter/Space for Got it. */
  onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (this.phase === 'asking') {
      if ((LETTERS as readonly string[]).includes(k)) {
        e.preventDefault();
        this.answer(k as Letter);
      } else if (k === '?' || k === '/') {
        e.preventDefault();
        this.answer(null);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      const btn = this.el.querySelector<HTMLButtonElement>('[data-testid=continue]');
      if (btn && document.activeElement !== btn) {
        e.preventDefault();
        btn.click();
      }
    }
  }
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
