// Find All: "Find all the Gs!" Tap every key with that letter name on the same C2–C6 keyboard Note
// Catcher uses. The play shell sees ONE answer per question: this input collects the taps itself and
// calls onAnswer once, when the last key is found (the letter), on the first wrong key (that key's
// letter, so the miss feeds the confusion matrix), or on "?". No shell changes were needed.

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty, level, recall } from '../core/engine';
import { FIND_ALL, FIND_LANE, answerFor, findItem, landmarkFor, promptText, targetsOf } from '../core/findAll';
import { coreMode } from '../core/modes';
import { frequency, midi, parseNote } from '../core/music';
import { CATCHER_RANGE, MIDDLE_C } from '../core/noteCatcher';
import { clear, h } from './dom';
import type { AnswerInput } from './letterPad';
import { defineMode, medalCounts } from './mode';
import { neutralKeyLabels } from './noteCatcher';
import { type Piano, type PianoKey, createPiano, keyName, pianoKeys } from './piano';
import { type PlayHost, PlayShell } from './playShell';
import './letterMath.css';
import './noteCatcher.css';
import './findAll.css';

interface FindInput extends AnswerInput<string> {
  /** Build the piano for this question. */
  show(itemId: string): void;
  /** The keys the current question asks for, low to high. */
  targets(): string[];
}

/** Shown (not scored) when a black key is tapped: they are not part of this mode. */
export const BLACK_TIP = "That's a black key. We're finding white keys. Try again!";

function findInput(synth: Synth, onAnswer: (answer: string | null) => void, counter: (found: number, total: number) => void): FindInput {
  let piano: Piano | null = null;
  let keys: PianoKey[] = [];
  let itemId = '';
  let targets: string[] = [];
  let wrong: string | null = null;
  const found = new Set<string>();
  let open = true;
  const slot = h('div', { class: 'catcher-input__piano' });
  const idk = h('button', { class: 'pad__key pad__idk catcher__idk', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => open && onAnswer(null) }, '?');
  const tip = h('p', { class: 'catcher__tip', role: 'status', 'data-testid': 'catcher-tip' });
  const el = h('div', { class: 'catcher-input', role: 'group', 'aria-label': 'Find the keys' }, slot, tip, idk);
  const play = (id: string) => synth.note(frequency(parseNote(id)));

  const label = (named: boolean) => {
    const neutral = neutralKeyLabels(keys);
    piano?.el.querySelectorAll<HTMLButtonElement>('.piano__key').forEach((b) => {
      const k = keys.find((key) => key.midi === Number(b.dataset.midi))!;
      b.setAttribute('aria-label', named ? keyName(k) : neutral.get(k.midi)!);
    });
    piano?.el.setAttribute('aria-label', named ? 'Piano keyboard' : 'Piano keys');
  };

  /** The one answer: every key found (wrongKey null), or the first wrong key. */
  function finish(wrongKey: string | null) {
    if (!open) return;
    wrong = wrongKey;
    onAnswer(answerFor(findItem(itemId), wrongKey));
  }

  function press(id: string) {
    if (!open) return;
    const note = parseNote(id);
    if (note.acc) {
      tip.textContent = BLACK_TIP;
      play(id);
      return;
    }
    tip.textContent = '';
    if (found.has(id)) return; // a found key stays found; tapping it again does nothing
    play(id);
    if (!targets.includes(id)) return finish(id);
    found.add(id);
    piano?.mark(midi(note), 'found');
    counter(found.size, targets.length);
    if (found.size === targets.length) finish(null);
  }

  return {
    el,
    targets: () => targets,
    show(id) {
      piano?.dispose();
      itemId = id;
      targets = targetsOf(findItem(id).letter);
      found.clear();
      wrong = null;
      keys = pianoKeys(CATCHER_RANGE.low, CATCHER_RANGE.high);
      piano = createPiano({ low: CATCHER_RANGE.low, high: CATCHER_RANGE.high, labels: 'middleC', anchorText: true, scroll: true, onPress: (_m, key) => press(key) });
      clear(slot);
      slot.append(piano.el);
      piano.reveal([midi(parseNote(MIDDLE_C))], false);
      tip.textContent = '';
      counter(0, targets.length);
      label(false);
    },
    setEnabled(enabled) {
      open = enabled;
      idk.disabled = !enabled;
      piano?.setEnabled(enabled);
      label(!enabled);
    },
    markRight() {
      // Every target: a check on the ones found, "target" on the ones missed (with the wrong key in view).
      for (const t of targets) piano?.mark(midi(parseNote(t)), found.has(t) ? 'right' : 'target');
      const missed = targets.filter((t) => !found.has(t));
      if (missed.length) piano?.reveal([...missed, ...(wrong ? [wrong] : [])].map((n) => midi(parseNote(n))), true);
      return piano?.el.querySelector<HTMLElement>(`[data-note="${missed[0] ?? targets[targets.length - 1]}"]`) ?? null;
    },
    markWrong() {
      if (!wrong) return null;
      piano?.mark(midi(parseNote(wrong)), 'wrong');
      return piano?.el.querySelector<HTMLElement>(`[data-note="${wrong}"]`) ?? null;
    },
    fromKey(e) {
      return e.key === '?' || e.key === '/' ? { answer: null } : undefined;
    },
    dispose() {
      piano?.dispose();
    },
  };
}

export function findAllPlay(host: PlayHost<string>, synth: Synth): PlayShell<string> {
  const promptEl = h('div', { class: 'find-question', 'data-testid': 'find-question' });
  const count = h('span', { class: 'find-count', role: 'status', 'data-testid': 'find-count' });
  let input: FindInput | null = null;
  const counter = (n: number, total: number) => {
    count.textContent = `${n} of ${total} found`;
  };
  return new PlayShell<string>(host, {
    unit: 'keys',
    screenClass: 'note-catcher find-all',
    cardClass: 'staff-card lm-card',
    promptEl,
    input: (onAnswer) => (input = findInput(synth, onAnswer, counter)),
    newBadge: '✨ New letter! Know where its keys are? If not, tap ?',
    correctMs: 1100,
    mastered: (state) => {
      const c = medalCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => {
      const item = findItem(id);
      clear(promptEl);
      promptEl.dataset.item = id;
      promptEl.append(h('p', { class: 'lm-prompt', 'aria-label': promptText(item) }, 'Find all the ', h('strong', { class: 'lm-letter' }, item.letter), 's!'), count);
      input?.show(id);
    },
    // Nothing sounds when the question appears (a sound would give a key away by ear). Each key sounds
    // as it is tapped; at the end all the keys play low to high, so the answer is heard together.
    play: (id, when) => {
      if (when !== 'answer') return;
      const targets = input?.targets() ?? targetsOf(findItem(id).letter);
      targets.forEach((t, i) => synth.note(frequency(parseNote(t)), 0.4 + i * 0.28, 0.9));
    },
    feedback: ({ itemId, outcome, answer, isNew }) => {
      const item = findItem(itemId);
      const fresh = isNew ? "Here's a new one! " : '';
      const total = targetsOf(item.letter).length;
      const lead =
        outcome === 'wrong'
          ? `${fresh}That key is ${answer}. We were finding ${item.letter}s. Here are all ${total} of them.`
          : `${fresh}${isNew ? '' : 'Thanks for being honest! '}Here are all ${total} ${item.letter}s.`;
      return h('div', { class: `hint hint--${outcome}` }, h('p', { class: 'hint__lead' }, lead), h('p', {}, '🧭 ', landmarkFor(item.letter)));
    },
  });
}

const ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** The Find All progress map: one row of letters. */
export function renderFindMap(state: StudentState, now: number): HTMLElement {
  const items = [...FIND_ALL.groups[FIND_LANE]!].sort((a, b) => ORDER.indexOf(a.letter) - ORDER.indexOf(b.letter));
  return h(
    'div',
    { class: 'lm-map', 'data-testid': 'find-map' },
    h(
      'div',
      { class: 'lm-row' },
      h('span', { class: 'lm-row__title' }, 'Letters'),
      h(
        'span',
        { class: 'lm-row__cells' },
        ...items.map((item) => {
          const it = state.items[item.id]!;
          const lvl = level(it);
          const dusty = isDusty(it, now);
          const text = lvl === 'locked' ? 'Coming soon' : `${item.letter} keys: ${lvl}${dusty ? ' (needs a polish)' : ''}`;
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
            lvl === 'locked' ? '' : item.letter,
          );
        }),
      ),
    ),
  );
}

export const findAllMode = defineMode<string>({
  id: 'find',
  title: 'Find All',
  icon: 'keyboard',
  blurb: 'Find every key with that name',
  group: 'keys',
  core: coreMode('find'),
  words: {
    item: 'letter',
    medal: 'letter',
    encourage: 'Every practice helps your eyes find the keys. Letters turn silver when you know them well, and gold when you still know them on another day!',
  },
  createPlay: (host, env) => findAllPlay(host, env.synth),
  renderMap: renderFindMap,
  itemLabel: (id) => `${findItem(id).letter} keys`,
});
