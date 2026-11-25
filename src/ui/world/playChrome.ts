// The play screen's themed chrome, shared by Name It and Letter Math: the top bar (quit, journey,
// trophy keyboard, sound) and the "coach" row (the mascot beside the feedback area), plus the
// reactions for each answer. See fx.ts for the guardrails on how big each reaction may be.

import { getTheme } from '../../core/themes';
import { h } from '../dom';
import { BURST, type Reaction, clearParticles, correctBurst, flyKey, masteryBurst, nudge, pop, record } from './fx';
import { icon, medal as medalIcon } from './icons';
import { Journey } from './journey';
import { MOOD_MS, renderMascot, setMood } from './mascots';
import { guardStaff } from './world';

export type Medal = 'silver' | 'gold' | null;

export interface PlayChromeOptions {
  length: number;
  /** Silver + gold items in this mode before the session (the trophy count). */
  mastered: number;
  onQuit: () => void;
  mute: HTMLElement;
  /** e.g. "keys" or "skills", for the trophy's label. */
  unit: string;
}

export class PlayChrome {
  readonly topbar: HTMLElement;
  readonly coach: HTMLElement;
  readonly feedback: HTMLElement;
  private readonly journey: Journey;
  private readonly mascot: HTMLElement;
  private readonly trophy: HTMLElement;
  private mastered: number;

  constructor(private readonly opts: PlayChromeOptions) {
    const theme = getTheme(document.documentElement.dataset.theme);
    this.mastered = opts.mastered;
    this.journey = new Journey(theme.id, opts.length);
    this.trophy = h(
      'div',
      { class: 'trophy', role: 'img', 'data-testid': 'trophy' },
      icon('keyboard'),
      h('span', { class: 'trophy__n' }, String(this.mastered)),
    );
    this.labelTrophy();
    this.topbar = h(
      'header',
      { class: 'topbar topbar--play' },
      h('button', { class: 'icon-btn', 'aria-label': 'Stop and go home', onClick: opts.onQuit }, icon('close')),
      this.journey.el,
      this.trophy,
      opts.mute,
    );
    this.mascot = renderMascot(theme.id, { mood: 'thinking', cls: 'coach__mascot' });
    this.feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    this.coach = h('div', { class: 'coach' }, this.mascot, this.feedback);
  }

  private labelTrophy(): void {
    this.trophy.setAttribute('aria-label', `${this.mastered} ${this.opts.unit} at silver or gold`);
    this.trophy.querySelector('.trophy__n')!.textContent = String(this.mastered);
  }

  /** A new question is up: the mascot waits quietly; make sure nothing moves behind the staff. */
  asking(done: number, card: Element | null): void {
    clearParticles();
    this.journey.set(done);
    setMood(this.mascot, 'thinking');
    guardStaff(card);
  }

  /**
   * React to an answer. `button` is the key that was pressed (for wrong: the wrong key), `target` the
   * correct key. Returns the visual duration in ms (also recorded for tests).
   */
  react(outcome: 'correct' | 'wrong' | 'idk', done: number, target: HTMLElement, button: HTMLElement | null, medal: Medal, letter: string): number {
    this.journey.set(done, outcome === 'correct');
    let kind: Reaction = outcome;
    let particles = 0;
    let ms: number;
    if (outcome === 'correct' && medal) {
      kind = medal;
      particles = masteryBurst(target, medal);
      const fly = flyKey(target, this.trophy, letter, medal, () => {
        this.mastered++;
        this.labelTrophy();
      });
      ms = Math.max(setMood(this.mascot, 'cheer'), fly, particles ? BURST[medal].ms : 0, pop(target, 1.14, 320));
    } else if (outcome === 'correct') {
      particles = correctBurst(target);
      ms = Math.max(setMood(this.mascot, 'happy'), particles ? BURST.correct.ms : 0, pop(target, 1.1, 240));
    } else {
      // Wrong or "?": one small, kind gesture. No particles, shorter than any correct reaction.
      ms = Math.max(setMood(this.mascot, 'encourage'), outcome === 'wrong' && button ? nudge(button) : 0);
    }
    record(kind, particles, ms);
    return ms;
  }
}

/** The praise line under the staff after a correct answer: a check, or a medal for new mastery. */
export function praise(medal: Medal, extra = ''): HTMLElement {
  const el = h(
    'p',
    { class: `praise${medal ? ` praise--${medal}` : ''}` },
    medal ? medalIcon(medal, 'praise__medal') : icon('check', 'praise__icon'),
    medal ? h('span', {}, medal === 'gold' ? 'Gold!' : 'Silver!') : extra ? h('span', {}, extra) : null,
  );
  pop(el, 1.25, 260);
  return el;
}

export const REACTION_MS = { correct: Math.max(MOOD_MS.happy, BURST.correct.ms), wrong: MOOD_MS.encourage };
