import { describe, expect, it } from 'vitest';
import { type NoteEvent, RELEASE, dueNotes, midiToFreq, pickVoiceToSteal, scheduleSequence, secondsPerBeat } from '../src/audio/sequence';

const ev = (midi: number, beat: number, beats: number, voice: NoteEvent['voice'] = 'melody', vel = 1): NoteEvent => ({ midi, beat, beats, voice, vel });

describe('beats to seconds', () => {
  it.each([
    [60, 1],
    [120, 0.5],
    [90, 2 / 3],
    [30, 2],
  ])('%i bpm is %f s per beat', (bpm, spb) => {
    expect(secondsPerBeat(bpm)).toBeCloseTo(spb, 10);
  });

  it('places notes at beat * seconds-per-beat at several tempos', () => {
    const events = [ev(60, 0, 1), ev(62, 1, 0.5), ev(64, 1.5, 2)];
    for (const bpm of [60, 100, 144]) {
      const spb = 60 / bpm;
      const tl = scheduleSequence(events, bpm);
      expect(tl.notes.map((n) => n.start)).toEqual(events.map((e) => e.beat * spb));
      expect(tl.notes.map((n) => n.seconds)).toEqual(events.map((e) => e.beats * spb));
    }
  });

  it('is deterministic and does not mutate the input', () => {
    const events = [ev(64, 2, 1), ev(60, 0, 1)];
    const copy = structuredClone(events);
    expect(scheduleSequence(events, 100)).toEqual(scheduleSequence(events, 100));
    expect(events).toEqual(copy);
  });

  it('rejects bad tempos and bad events', () => {
    for (const bpm of [0, -5, 19, 301, NaN, Infinity]) expect(() => secondsPerBeat(bpm)).toThrow(RangeError);
    expect(() => scheduleSequence([ev(60, -1, 1)], 100)).toThrow(RangeError);
    expect(() => scheduleSequence([ev(60, 0, 0)], 100)).toThrow(RangeError);
    expect(() => scheduleSequence([ev(60, 0, Infinity)], 100)).toThrow(RangeError);
  });

  it('clamps velocity to 0..1', () => {
    const tl = scheduleSequence([ev(60, 0, 1, 'melody', 2), ev(62, 1, 1, 'melody', -1)], 60);
    expect(tl.notes.map((n) => n.vel)).toEqual([1, 0]);
  });
});

describe('overlapping voices and total duration', () => {
  const events = [ev(48, 0, 4, 'bass'), ev(60, 0, 4, 'chord'), ev(64, 0, 4, 'chord'), ev(72, 0, 1), ev(74, 1, 1), ev(76, 2, 2)];

  it('keeps simultaneous notes at the same time, in the caller order', () => {
    const tl = scheduleSequence(events, 120);
    expect(tl.notes.slice(0, 4).map((n) => n.start)).toEqual([0, 0, 0, 0]);
    expect(tl.notes.slice(0, 4).map((n) => n.index)).toEqual([0, 1, 2, 3]);
  });

  it('total is the last end plus that voice release', () => {
    // 120 bpm: the 4-beat chord and bass end at 2 s, the last melody note also at 2 s.
    const tl = scheduleSequence(events, 120);
    expect(tl.total).toBeCloseTo(2 + RELEASE.chord, 10);
    expect(scheduleSequence([], 120).total).toBe(0);
  });

  it('a note that starts late can define the total even if it is short', () => {
    const tl = scheduleSequence([ev(60, 0, 8, 'bass'), ev(72, 7, 0.5)], 60);
    expect(tl.total).toBeCloseTo(Math.max(8 + RELEASE.bass, 7.5 + RELEASE.melody), 10);
  });
});

describe('onNote order', () => {
  it('sorts by start but reports the caller indexes', () => {
    const tl = scheduleSequence([ev(64, 2, 1), ev(60, 0, 1), ev(62, 1, 1)], 60);
    expect(tl.notes.map((n) => n.index)).toEqual([1, 2, 0]);
  });

  it('dueNotes pages through the timeline by horizon without repeats', () => {
    const tl = scheduleSequence([ev(60, 0, 1), ev(62, 1, 1), ev(64, 2, 1), ev(65, 3, 1)], 60);
    const a = dueNotes(tl, 0, 1.5);
    expect(a.notes.map((n) => n.index)).toEqual([0, 1]);
    const b = dueNotes(tl, a.upTo, 1.5);
    expect(b.notes).toEqual([]);
    const c = dueNotes(tl, b.upTo, 10);
    expect(c.notes.map((n) => n.index)).toEqual([2, 3]);
    expect(c.upTo).toBe(4);
  });
});

describe('midiToFreq', () => {
  it('maps A4 to 440 and doubles per octave', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880, 8);
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
  });
});

describe('voice stealing', () => {
  const live = [
    { start: 3, voice: 'melody' as const },
    { start: 2, voice: 'chord' as const },
    { start: 1, voice: 'bass' as const },
    { start: 0, voice: 'chord' as const },
  ];
  it('melody takes the cheapest voice first', () => {
    expect(pickVoiceToSteal(live, 'melody')).toBe(2);
  });
  it('chord takes the oldest chord/bass, bass first', () => {
    expect(pickVoiceToSteal(live, 'chord')).toBe(2);
    expect(pickVoiceToSteal(live.filter((v) => v.voice !== 'bass'), 'chord')).toBe(2); // oldest chord
  });
  it('never cuts a more important voice', () => {
    expect(pickVoiceToSteal([{ start: 0, voice: 'melody' }], 'bass')).toBe(-1);
    expect(pickVoiceToSteal([], 'melody')).toBe(-1);
  });
  it('among equals the oldest goes', () => {
    expect(pickVoiceToSteal([{ start: 5, voice: 'melody' }, { start: 1, voice: 'melody' }], 'melody')).toBe(1);
  });
});
