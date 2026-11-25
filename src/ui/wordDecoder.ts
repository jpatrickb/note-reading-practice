// Word Decoder screens: a phrase of notes spells a word; the kid names each note in turn (the cursor
// moves along), and the word appears letter by letter. The play shell sees ONE question per word and
// ONE answer at the end (`submission` in core/wordDecoder.ts); the note-by-note flow lives in the
// answer input below. A wrong note shows that note's hint and waits for "Got it" before the next.

import type { Synth } from '../audio/synth';
import { type StudentState, isDusty, level, recall } from '../core/engine';
import { hintFor } from '../core/hints';
import { coreMode } from '../core/modes';
import { type Clef, type Letter, type Note, frequency } from '../core/music';
import {
  type NoteResult,
  WORD_ITEMS,
  WORD_MODE,
  chooseNotes,
  clefReady,
  setNameItSource,
  submission,
  wordItem,
} from '../core/wordDecoder';
import { type MountedStaffSequence, type NoteState, mountStaffSequence } from '../render/staffSequence';
import type { Profile } from '../core/codec';
import { clear, h } from './dom';
import { type AnswerInput, letterPad } from './letterPad';
import { defineMode, medalCounts } from './mode';
import { type PlayHost, PlayShell } from './playShell';
import { icon } from './world/icons';
import './letterMath.css';
import './wordDecoder.css';

/** One word on screen: the notes, how each was answered, and where the cursor is. */
interface Decode {
  id: string;
  clef: Clef;
  word: string;
  notes: Note[];
  results: NoteResult[];
  states: NoteState[];
  labels: (string | undefined)[];
  mount: MountedStaffSequence;
  /** A hint is showing and the kid has not said "Got it". */
  pending: boolean;
  done: boolean;
  outcome: 'correct' | 'wrong' | 'idk' | null;
}

const ordinal = (n: number) => ['1st', '2nd', '3rd'][n] ?? `${n + 1}th`;

export function wordDecoderPlay(host: PlayHost<string>, synth: Synth, profile?: Profile): PlayShell<string> {
  setNameItSource(profile ? () => profile.name : null);
  const staffEl = h('div', { class: 'wd-staff' });
  const blanksEl = h('ol', { class: 'wd-blanks', 'data-testid': 'wd-blanks', 'aria-live': 'polite' });
  const hintEl = h('div', { class: 'wd-hint-slot' });
  const bannerEl = h('p', { class: 'wd-reveal', 'data-testid': 'wd-reveal', 'aria-live': 'polite' });
  const promptEl = h('div', { class: 'wd-question', 'data-testid': 'wd-question' }, staffEl, blanksEl, bannerEl, hintEl);
  let cur: Decode | null = null;

  const drawBlanks = () => {
    clear(blanksEl);
    if (!cur) return;
    cur.word.split('').forEach((l, i) => {
      const done = cur!.states[i] !== 'idle';
      const mark = cur!.states[i];
      blanksEl.append(
        h(
          'li',
          { class: `wd-blank${done ? ` wd-blank--${mark}` : ''}${cur!.mount.svg.dataset.cursor === String(i) ? ' wd-blank--now' : ''}`, 'aria-label': done ? `${l}` : `letter ${i + 1}, blank` },
          done ? l : '',
        ),
      );
    });
  };
  const paint = (cursor: number | undefined) => {
    const c = cur!;
    c.mount.update({ states: c.states, labels: c.labels });
    c.mount.setCursor(cursor);
    drawBlanks();
  };

  let enabled = false;
  let padEl: AnswerInput<Letter> | null = null;
  const setPad = (on: boolean) => padEl?.setEnabled(on);

  /** Names the current note: a letter, or null for "?". */
  const nameNote = (letter: Letter | null) => {
    const c = cur;
    if (!c || c.done || c.pending || !enabled) return;
    const i = c.results.length;
    const target = c.word[i]!;
    const result: NoteResult = letter === null ? { mark: 'idk' } : letter === target ? { mark: 'right' } : { mark: 'wrong', letter };
    c.results.push(result);
    c.states[i] = result.mark === 'right' ? 'right' : result.mark === 'wrong' ? 'wrong' : 'reveal';
    c.labels[i] = target;
    synth.note(frequency(c.notes[i]!));
    const last = i === c.word.length - 1;
    if (result.mark !== 'right') {
      padEl!.markRight(c.id);
      if (result.mark === 'wrong') padEl!.markWrong(c.id, letter!);
    }
    if (last) {
      c.done = true;
      paint(undefined);
      finish();
    } else if (result.mark === 'right') {
      paint(i + 1);
    } else {
      // The miss gets its hint and waits; the pad is held until "Got it".
      c.pending = true;
      setPad(false);
      paint(i);
      showHint(i, result);
    }
  };

  const finish = () => {
    const c = cur!;
    onAnswer(submission(c.word, c.results));
  };

  const showHint = (i: number, result: NoteResult) => {
    const c = cur!;
    const hint = hintFor(c.notes[i]!, c.clef);
    const target = c.word[i]!;
    const lead = result.mark === 'wrong' ? `That note is ${target}, not ${result.letter}.` : `That note is ${target}.`;
    clear(hintEl);
    hintEl.append(
      h(
        'div',
        { class: 'hint hint--wrong wd-hint', role: 'status', 'data-testid': 'wd-hint' },
        h('p', { class: 'hint__lead' }, lead, ' ', hint.position),
        hint.mnemonic && h('p', {}, '🧠 ', hint.mnemonic),
        h('p', {}, '🧭 ', hint.landmark),
        h('button', { class: 'primary', 'data-testid': 'note-continue', onClick: gotIt }, 'Got it →'),
      ),
    );
    hintEl.querySelector<HTMLElement>('[data-testid=note-continue]')?.focus();
  };

  const gotIt = () => {
    const c = cur;
    if (!c || !c.pending) return;
    c.pending = false;
    clear(hintEl);
    setPad(true);
    paint(c.results.length);
  };

  let onAnswer: (answer: string | null) => void = () => {};

  const input = (answer: (a: string | null) => void): AnswerInput<string> => {
    onAnswer = answer;
    const pad = letterPad('Note names', (l) => nameNote(l), () => (cur?.word[Math.max(0, cur.results.length - 1)] ?? 'C') as Letter);
    padEl = pad;
    return {
      el: pad.el,
      setEnabled(on) {
        enabled = on;
        pad.setEnabled(on && !cur?.pending);
      },
      markRight: () => staffEl,
      markWrong: () => null,
      fromKey(e) {
        if (cur?.pending) {
          if (e.key === 'Enter' || e.key === ' ') gotIt();
          return 'handled';
        }
        const a = pad.fromKey(e);
        if (a === undefined || a === 'handled') return a;
        nameNote(a.answer);
        return 'handled';
      },
    };
  };

  return new PlayShell<string>(host, {
    unit: 'words',
    screenClass: 'word-decoder',
    cardClass: 'staff-card wd-card',
    promptEl,
    input,
    newBadge: '✨ New word! Know the notes? If not, tap ?',
    correctMs: 1800,
    mastered: (state) => {
      const c = medalCounts(state);
      return c.gold + c.silver;
    },
    renderPrompt: (id) => {
      const item = wordItem(id);
      const notes = chooseNotes(item, profile?.name, Math.random);
      const n = notes.length;
      const states: NoteState[] = Array(n).fill('idle');
      const labels: (string | undefined)[] = Array(n).fill(undefined);
      const mount = mountStaffSequence(notes, item.clef, { cursor: 0, states, labels }, 'Notes that spell a secret word, scrolls sideways');
      cur = { id, clef: item.clef, word: item.word, notes, results: [], states, labels, mount, pending: false, done: false, outcome: null };
      promptEl.dataset.item = id;
      clear(staffEl);
      staffEl.append(mount.el);
      clear(hintEl);
      bannerEl.textContent = '';
      bannerEl.className = 'wd-reveal';
      drawBlanks();
    },
    reveal: (_id, outcome, target) => {
      const c = cur!;
      c.outcome = outcome;
      c.done = true;
      paint(undefined);
      bannerEl.className = `wd-reveal wd-reveal--${outcome}`;
      bannerEl.textContent = outcome === 'correct' ? `🔓 ${target}!` : `The word is ${target}.`;
    },
    // Only a solved word gets the little tune (D4: sound always on; the reward belongs to right answers).
    play: (_id, when) => {
      const c = cur;
      if (when === 'ask' || !c || c.outcome !== 'correct') return;
      c.notes.forEach((n, i) => synth.note(frequency(n), 0.5 + i * 0.22, 0.6, 0.22));
    },
    feedback: ({ outcome, target, isNew }) => {
      const c = cur!;
      const lastIdx = c.word.length - 1;
      const lastMissed = c.results[lastIdx]?.mark !== 'right';
      const lead = isNew
        ? `Here's a new word: ${target}.`
        : outcome === 'wrong'
          ? `That word is ${target}. One of the notes was different.`
          : `That word is ${target}. Thanks for being honest!`;
      const hint = lastMissed ? hintFor(c.notes[lastIdx]!, c.clef) : null;
      return h(
        'div',
        { class: `hint hint--${outcome}` },
        h('p', { class: 'hint__lead' }, lead),
        hint && h('p', {}, `The ${ordinal(lastIdx)} note is ${c.word[lastIdx]}. ${hint.position}`),
        hint?.mnemonic && h('p', {}, '🧠 ', hint.mnemonic),
        hint && h('p', {}, '🧭 ', hint.landmark),
      );
    },
  });
}

/** The cells of a lane: one chip per word, showing the word once it is open. */
export function renderWordMap(state: StudentState, now: number, opts: { lanes?: readonly string[] } = {}): HTMLElement {
  const clefs = (['treble', 'bass'] as Clef[]).filter((c) => !opts.lanes || opts.lanes.includes(c));
  const later = WORD_ITEMS.filter((i) => clefs.includes(i.clef) && !state.items[i.id]!.unlocked).length;
  return h(
    'div',
    { class: 'lm-map wd-map', 'data-testid': 'word-map' },
    ...clefs.map((clef) =>
      h(
        'div',
        { class: 'wd-map__lane' },
        clefs.length > 1 && h('h3', { class: 'map-head' }, clef === 'treble' ? 'Treble words' : 'Bass words'),
        h(
          'div',
          { class: 'wd-map__cells' },
          ...WORD_ITEMS.filter((i) => i.clef === clef && state.items[i.id]!.unlocked).map((item) => {
            const it = state.items[item.id]!;
            const lvl = level(it);
            const dusty = isDusty(it, now);
            const label = `${item.word}: ${lvl}${dusty ? ' (needs a polish)' : ''}`;
            return h(
              'span',
              {
                class: `lm-cell wd-cell lm-cell--${lvl}${dusty ? ' lm-cell--dusty' : ''}`,
                'data-item': item.id,
                'data-level': lvl,
                role: 'img',
                'aria-label': label,
                title: label,
                style: lvl === 'learning' ? `--fill: ${Math.round(100 * recall(it, now))}%` : undefined,
              },
              item.word,
            );
          }),
        ),
      ),
    ),
    later > 0 && h('p', { class: 'muted lm-map__later' }, icon('lock', 'lm-map__lock'), `${later} more word${later > 1 ? 's' : ''} to unlock as you learn notes.`),
  );
}

/** Word Decoder's registration. */
export const wordDecoderMode = defineMode<string>({
  id: 'words',
  title: 'Word Decoder',
  icon: 'sparkle',
  blurb: 'Read the notes, spell a word',
  group: 'read',
  core: coreMode('words'),
  session: WORD_MODE,
  lanes: 'clefs',
  words: {
    item: 'word',
    medal: '',
    encourage: 'Every word you decode makes your note reading stronger. Words turn silver when you decode them well, and gold when you still can on another day!',
  },
  // Only the clefs where the kid has enough silver notes; the kid's pick still decides among those.
  groups: (clefs, profile) => {
    const ready = profile ? clefs.filter((c) => clefReady(profile.name, c)) : [...clefs];
    return ready.length > 0 ? ready : (['treble', 'bass'] as Clef[]).filter((c) => !profile || clefReady(profile.name, c));
  },
  createPlay: (host, env) => wordDecoderPlay(host, env.synth, env.profile),
  renderMap: renderWordMap,
  itemLabel: (id) => {
    const item = wordItem(id);
    return `${item.word} (${item.clef} clef)`;
  },
  availability: (profile) =>
    clefReady(profile.name, 'treble') || clefReady(profile.name, 'bass')
      ? { ok: true }
      : { ok: false, reason: 'Learn a few more notes in Name It first!' },
});
