// Pure timing for note sequences: note events (in beats) + tempo -> absolute seconds. No Web Audio
// here, so it is deterministic and unit-testable. The synth feeds the result to the audio clock.

export type VoiceKind = 'melody' | 'chord' | 'bass';

/** One note of a sequence, positioned in beats (so the tempo can change without editing the tune). */
export interface NoteEvent {
  /** MIDI note number (60 = middle C). */
  midi: number;
  /** Start, in beats from the beginning of the sequence. */
  beat: number;
  /** Length, in beats. */
  beats: number;
  voice: VoiceKind;
  /** Loudness 0..1 (scaled by the voice's own level). */
  vel: number;
}

export interface TimedNote {
  /** Index into the events array the caller passed (so onNote(i) refers to the caller's note). */
  index: number;
  midi: number;
  voice: VoiceKind;
  vel: number;
  /** Seconds from the start of the sequence. */
  start: number;
  /** Written length in seconds (beats * seconds-per-beat). */
  seconds: number;
  /** How long the note rings: its length plus a voice-specific release tail. */
  ring: number;
}

export interface Timeline {
  /** Sorted by start time; ties keep the caller's order (stable). */
  notes: TimedNote[];
  /** Seconds until the last note has finished ringing. */
  total: number;
}

export const MIN_BPM = 20;
export const MAX_BPM = 300;

/** Extra ring after the written end, so short notes don't cut off dead. */
export const RELEASE: Record<VoiceKind, number> = { melody: 0.3, chord: 0.4, bass: 0.3 };

export function secondsPerBeat(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    throw new RangeError(`bpm must be between ${MIN_BPM} and ${MAX_BPM}`);
  }
  return 60 / bpm;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function scheduleSequence(events: readonly NoteEvent[], bpm: number): Timeline {
  const spb = secondsPerBeat(bpm);
  const notes = events.map((e, index): TimedNote => {
    if (!(e.beat >= 0) || !(e.beats > 0) || !Number.isFinite(e.beat + e.beats)) {
      throw new RangeError(`event ${index}: beat must be >= 0 and beats > 0`);
    }
    const seconds = e.beats * spb;
    return { index, midi: e.midi, voice: e.voice, vel: Math.min(1, Math.max(0, e.vel)), start: e.beat * spb, seconds, ring: seconds + RELEASE[e.voice] };
  });
  notes.sort((a, b) => a.start - b.start || a.index - b.index);
  const total = notes.reduce((m, n) => Math.max(m, n.start + n.ring), 0);
  return { notes, total };
}

/** Notes (from position `from` in the sorted list) that start before `horizon` seconds. */
export function dueNotes(tl: Timeline, from: number, horizon: number): { upTo: number; notes: TimedNote[] } {
  let i = from;
  while (i < tl.notes.length && tl.notes[i]!.start < horizon) i++;
  return { upTo: i, notes: tl.notes.slice(from, i) };
}

/** Voices that are cheapest to lose when the polyphony cap is hit: bass first, then chord, melody last. */
export const PRIORITY: Record<VoiceKind, number> = { bass: 0, chord: 1, melody: 2 };

/**
 * Which live voice to cut to make room for a new one, or -1 to drop the new one instead.
 * Cuts the oldest voice of equal or lower priority; never a more important one.
 */
export function pickVoiceToSteal(live: readonly { start: number; voice: VoiceKind }[], incoming: VoiceKind): number {
  let best = -1;
  for (let i = 0; i < live.length; i++) {
    const v = live[i]!;
    if (PRIORITY[v.voice] > PRIORITY[incoming]) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const b = live[best]!;
    if (PRIORITY[v.voice] < PRIORITY[b.voice] || (PRIORITY[v.voice] === PRIORITY[b.voice] && v.start < b.start)) best = i;
  }
  return best;
}
