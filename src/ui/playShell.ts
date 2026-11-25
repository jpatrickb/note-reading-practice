// The shared play screen. A mode (Name It, Letter Math, ...) supplies its prompt, its input and its
// hints; the shell owns everything else: top bar, banner, feedback area, the answer flow, timers.
//
// Learning guardrails live here, once (see docs/decisions.md D11, D15, D30, D35):
//  - correct answers auto-advance (700 ms Name It, 1000 ms Letter Math; 1600 ms on a new silver/gold);
//  - wrong answers and "?" explain and wait for "Got it →" (Enter/Space also work);
//  - a wrong answer may be followed by a mini-lesson, also dismissed by the student;
//  - wrong reactions are smaller than correct ones (see world/playChrome.ts).

import type { MasteryEvent, Outcome, StudentState } from '../core/engine';
import { LESSONS, type LessonId } from '../core/diagnose';
import { type Session, isFinished, nextQuestion, submit } from '../core/session';
import { clear, h } from './dom';
import type { AnswerInput } from './letterPad';
import { icon } from './world/icons';
import { type Medal, PlayChrome, praise } from './world/playChrome';

/** What a mode plugs into the shell. */
export interface PlayMode<A extends string = string> {
  /** Trophy label, e.g. "keys" or "skills". */
  unit: string;
  /** Extra class on the screen (`screen play <screenClass>`). */
  screenClass?: string;
  /** Class on the prompt card. */
  cardClass: string;
  /** Where the prompt is drawn (a staff, a sentence...). Placed in the card under the banner. */
  promptEl: HTMLElement;
  /** Build the answer input; call `onAnswer` when the student answers (null is "I don't know"). */
  input(onAnswer: (answer: A | null) => void): AnswerInput<A>;
  /** Banner for a never-seen item. */
  newBadge: string;
  /** Silver + gold items in this mode before the session (the trophy count). */
  mastered(state: StudentState): number;
  /** Draw the question into `promptEl`. */
  renderPrompt(itemId: string): void;
  /** Redraw the prompt once answered (e.g. label the note). Optional. */
  reveal?(itemId: string, outcome: Outcome, target: string): void;
  /** Play sound for the item: when the question appears and/or after the answer. Optional. */
  play?(itemId: string, when: 'ask' | 'answer'): void;
  /** The explanation after a wrong or "?" answer. The shell adds the "Got it →" button to it. */
  feedback(f: { itemId: string; outcome: 'wrong' | 'idk'; answer: A | null; target: string; isNew: boolean }): HTMLElement;
  /** Show the answer letter next to the check after a correct answer. */
  praiseTarget?: boolean;
  /** Auto-advance delay after a correct answer, in ms. Silver/gold always take 1600. */
  correctMs: number;
}

export interface PlayHost<A extends string = string> {
  session: Session<A>;
  state: StudentState;
  now(): number;
  save(): void;
  announce(events: MasteryEvent[]): void;
  muteButton(): HTMLElement;
  quit(): void;
  finish(): void;
  /** Silence anything still sounding (synth.stopAll) when the screen closes. */
  stopSound(): void;
}

export const MEDAL_MS = 1600;

export class PlayShell<A extends string = string> {
  private phase: 'asking' | 'feedback' | 'lesson' = 'asking';
  private timer = 0;
  private isNew = false;
  private lesson: LessonId | null = null;
  private readonly input: AnswerInput<A>;
  private disposed = false;
  private el!: HTMLElement;
  private chrome!: PlayChrome;
  private banner!: HTMLElement;
  private card!: HTMLElement;

  constructor(
    private readonly host: PlayHost<A>,
    private readonly mode: PlayMode<A>,
  ) {
    this.input = mode.input((a) => this.answer(a));
  }

  render(): HTMLElement {
    this.chrome = new PlayChrome({
      length: this.host.session.length,
      mastered: this.mode.mastered(this.host.state),
      onQuit: () => this.host.quit(),
      mute: this.host.muteButton(),
      unit: this.mode.unit,
    });
    this.banner = h('div', { class: 'banner' });
    this.card = h('div', { class: this.mode.cardClass }, this.banner, this.mode.promptEl);
    this.el = h('main', { class: `screen play${this.mode.screenClass ? ` ${this.mode.screenClass}` : ''}` }, this.chrome.topbar, this.card, this.chrome.coach, this.input.el);
    queueMicrotask(() => this.ask());
    return this.el;
  }

  dispose(): void {
    this.disposed = true;
    window.clearTimeout(this.timer);
    this.input.dispose?.();
    this.host.stopSound();
  }

  private active(): boolean {
    return !this.disposed && this.el.isConnected;
  }

  private ask(): void {
    if (!this.active()) return;
    const { session, state } = this.host;
    const qn = nextQuestion(session, state, this.host.now(), Math.random);
    clear(this.chrome.feedback);
    clear(this.banner);
    // First appearance: quiz right away (pretesting). "?" or a miss teaches it (decision D35).
    this.isNew = state.items[qn.itemId]!.n === 0;
    if (this.isNew) this.banner.append(h('span', { class: 'badge' }, this.mode.newBadge));
    this.phase = 'asking';
    this.mode.renderPrompt(qn.itemId);
    this.input.setEnabled(true);
    this.chrome.asking(session.results.length, this.card);
    this.mode.play?.(qn.itemId, 'ask');
  }

  /** `null` is "I don't know". */
  answer(answer: A | null): void {
    const { session, state } = this.host;
    if (!this.active() || this.phase !== 'asking' || !session.current) return;
    const itemId = session.current.itemId;
    const target = String(session.mode.engine.answerOf(itemId));
    const res = submit(session, state, answer, this.host.now());
    this.host.save();
    this.phase = 'feedback';
    const { input } = this;
    input.setEnabled(false);
    const targetBtn = input.markRight(itemId) ?? this.mode.promptEl;
    const wrongBtn = res.outcome === 'wrong' ? input.markWrong(itemId, answer!) : null;
    this.mode.reveal?.(itemId, res.outcome, target);
    this.mode.play?.(itemId, 'answer');
    this.host.announce(res.events);
    const medal: Medal = res.events.some((e) => e.kind === 'gold') ? 'gold' : res.events.some((e) => e.kind === 'silver') ? 'silver' : null;
    this.chrome.react(res.outcome, session.results.length, targetBtn, wrongBtn, medal, target);

    if (res.outcome === 'correct') {
      this.chrome.feedback.append(praise(medal, this.mode.praiseTarget ? target : ''));
      this.timer = window.setTimeout(() => this.advance(), medal ? MEDAL_MS : this.mode.correctMs);
      return;
    }

    this.lesson = res.lesson;
    const hint = this.mode.feedback({ itemId, outcome: res.outcome, answer, target, isNew: this.isNew });
    hint.append(h('button', { class: 'primary', 'data-testid': 'continue', onClick: () => this.advance() }, 'Got it →'));
    this.chrome.feedback.append(hint);
    this.focusContinue();
  }

  private focusContinue(): void {
    this.el.querySelector<HTMLElement>('[data-testid=continue]')?.focus();
  }

  private advance(): void {
    if (!this.active() || this.phase !== 'feedback') return;
    window.clearTimeout(this.timer);
    if (this.lesson) return this.showLesson(this.lesson);
    if (isFinished(this.host.session)) return this.host.finish();
    this.ask();
  }

  private showLesson(id: LessonId): void {
    this.lesson = null;
    this.phase = 'lesson';
    const lesson = LESSONS[id];
    clear(this.chrome.feedback);
    this.chrome.feedback.append(
      h(
        'div',
        { class: 'lesson', role: 'dialog', 'aria-label': lesson.title, 'data-testid': 'lesson' },
        h('h2', {}, icon('bulb', 'lesson__icon'), lesson.title),
        ...lesson.body.map((p) => h('p', {}, p)),
        h(
          'button',
          {
            class: 'primary',
            'data-testid': 'continue',
            onClick: () => {
              this.phase = 'feedback';
              this.advance();
            },
          },
          'OK, got it',
        ),
      ),
    );
    this.focusContinue();
  }

  /** Desktop typing: letters answer, "?" or "/" for I don't know, Enter/Space for Got it. */
  onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.phase === 'asking') {
      const a = this.input.fromKey(e);
      if (a !== undefined) {
        e.preventDefault();
        if (a !== 'handled') this.answer(a.answer);
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
