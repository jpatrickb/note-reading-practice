// Tiny piano-ish synth on the Web Audio API. No samples to download, so it works offline.
// iOS only allows audio after a user gesture, so call unlock() from a tap/click handler.
//
// Everything audible goes through `voiceAt`, which tracks live voices so stopAll() can silence them
// and the polyphony cap can keep old iPads from stuttering. Timing math lives in ./sequence (pure).

import { SilentSwitchKeepAlive } from './silentSwitch';
import { type NoteEvent, type VoiceKind, dueNotes, midiToFreq, pickVoiceToSteal, scheduleSequence } from './sequence';

/** Max notes sounding or scheduled at once. */
export const MAX_VOICES = 16;
/** How far ahead (seconds of audio clock) the scheduler queues notes, and how often it wakes. */
export const LOOKAHEAD = 0.2;
export const TICK_MS = 25;
/** Gap before a sequence starts, so the first note is scheduled rather than "now". */
const START_DELAY = 0.06;
/** A killed voice is disconnected this long after (fade 8 ms + stop at 50 ms), even if `onended` never fires. */
const KILL_CLEANUP_MS = 120;

interface Timbre {
  harmonics: number[];
  attack: number;
  /** Level (fraction of volume) reached at `decay` seconds, before the final fade. */
  sustain: number;
  decay: number;
  /** Lowpass opens to freq * open and closes to freq * close over the note (capped at ceil). */
  open: number;
  close: number;
  ceil: number;
  volume: number;
}

// 'melody' is the original piano-ish tone, unchanged. Chords and bass are softer and rounder
// (fewer overtones, slower attack, darker filter) so they sit under the tune.
const TIMBRES: Record<VoiceKind, Timbre> = {
  melody: { harmonics: [1, 0.45, 0.2, 0.1], attack: 0.008, sustain: 0.35, decay: 0.25, open: 8, close: 2, ceil: 8000, volume: 0.35 },
  chord: { harmonics: [1, 0.2, 0.06], attack: 0.03, sustain: 0.6, decay: 0.3, open: 4, close: 1.5, ceil: 3000, volume: 0.16 },
  bass: { harmonics: [1, 0.25], attack: 0.02, sustain: 0.55, decay: 0.3, open: 3, close: 1.5, ceil: 1200, volume: 0.24 },
};

interface Voice {
  start: number;
  end: number;
  voice: VoiceKind;
  kill(now: number): void;
}

export interface SequenceOptions {
  bpm: number;
  /** Called (in score order) when a note starts sounding; `i` indexes the events you passed. */
  onNote?(i: number): void;
}

export interface SequenceHandle {
  /** Silence this sequence now. Idempotent. */
  stop(): void;
  /** Resolves when the last note has finished, or the sequence was stopped. */
  done: Promise<void>;
}

export interface SynthDeps {
  createContext?: () => AudioContext | null;
  keepAlive?: SilentSwitchKeepAlive;
}

function defaultContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  private sequences = new Set<() => void>();
  private _muted = false;
  private readonly createContext: () => AudioContext | null;
  private readonly keepAlive: SilentSwitchKeepAlive;
  private unlocked = false;

  constructor(deps: SynthDeps = {}) {
    this.createContext = deps.createContext ?? defaultContext;
    this.keepAlive = deps.keepAlive ?? new SilentSwitchKeepAlive();
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Muting silences anything playing and releases the iPhone media channel; unmuting reclaims it. */
  set muted(value: boolean) {
    this._muted = value;
    if (value) {
      this.stopAll();
      this.keepAlive.stop();
    } else if (this.unlocked) {
      this.keepAlive.start();
    }
  }

  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.createContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    this.unlocked = true;
    if (!this._muted) this.keepAlive.start(); // must run inside the gesture so iPhone uses the media channel
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** A soft piano-like tone. */
  note(freq: number, when = 0, duration = 1.4, volume = 0.35): void {
    const ctx = this.ctx;
    if (!ctx || this._muted) return;
    this.keepAlive.touch();
    this.voiceAt(freq, ctx.currentTime + when, duration, volume, 'melody');
  }

  /** Several notes at once (a soft chord pad). `when` is seconds from now. */
  chord(midis: readonly number[], when = 0, dur = 1.2, volume = TIMBRES.chord.volume): void {
    const ctx = this.ctx;
    if (!ctx || this._muted) return;
    this.keepAlive.touch();
    for (const m of midis) this.voiceAt(midiToFreq(m), ctx.currentTime + when, dur, volume, 'chord');
  }

  /** Little rising arpeggio for mastery moments. */
  fanfare(gold: boolean): void {
    const base = gold ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    base.forEach((f, i) => this.note(f, 0.35 + i * 0.09, 0.9, 0.18));
  }

  /**
   * Play a tune in time. Notes are queued a short look-ahead at a time on the audio clock, so tempo
   * stays steady even if the page is busy. Muted (or not yet unlocked): schedules nothing, resolves at once.
   */
  playSequence(events: readonly NoteEvent[], opts: SequenceOptions): SequenceHandle {
    const ctx = this.ctx;
    const tl = scheduleSequence(events, opts.bpm);
    if (!ctx || this._muted || tl.notes.length === 0) return { stop() {}, done: Promise.resolve() };

    this.keepAlive.touch();
    const t0 = ctx.currentTime + START_DELAY;
    let next = 0; // next note to schedule
    let called = 0; // next note to announce via onNote
    let timer: ReturnType<typeof setInterval> | null = null;
    const mine = new Set<Voice>();
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));

    let stopped = false;
    const end = (silence: boolean) => {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
      this.sequences.delete(stop);
      if (silence) for (const v of mine) this.killVoice(v);
      mine.clear();
      finish();
    };
    const stop = () => end(true);

    const tick = () => {
      const now = ctx.currentTime - t0;
      const due = dueNotes(tl, next, now + LOOKAHEAD);
      for (const n of due.notes) {
        // After a throttled or hidden tab, notes already over are skipped, not played in a burst.
        if (n.start + n.ring < now) continue;
        const v =this.voiceAt(midiToFreq(n.midi), t0 + n.start, n.ring, TIMBRES[n.voice].volume * n.vel, n.voice);
        if (v) mine.add(v);
      }
      next = due.upTo;
      while (!stopped && called < tl.notes.length && tl.notes[called]!.start <= now) {
        const n = tl.notes[called++]!;
        if (n.start + n.ring < now) continue; // missed entirely: no stale highlight
        try {
          opts.onNote?.(n.index);
        } catch (e) {
          console.error(e); // a throwing callback must not repeat every tick or stop the music
        }
      }
      if (!stopped && now >= tl.total) end(false);
    };

    this.sequences.add(stop);
    timer = setInterval(tick, TICK_MS);
    tick();
    return { stop, done };
  }

  /** Silence everything now (call on screen change): live notes, queued notes and running sequences. */
  stopAll(): void {
    for (const stop of [...this.sequences]) stop();
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of [...this.voices]) this.killVoice(v);
  }

  private killVoice(v: Voice): void {
    this.voices.delete(v);
    v.kill(this.ctx?.currentTime ?? 0);
  }

  /** Build one note's nodes. Returns null if the polyphony cap says to drop it. */
  private voiceAt(freq: number, t: number, duration: number, volume: number, kind: VoiceKind): Voice | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;

    const now = ctx.currentTime;
    const live = [...this.voices].filter((v) => v.end > now);
    if (live.length >= MAX_VOICES) {
      const victim = pickVoiceToSteal(live, kind);
      if (victim < 0) return null;
      this.killVoice(live[victim]!);
    }

    const tb = TIMBRES[kind];
    const decayAt = Math.min(tb.decay, duration * 0.9);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(volume, t + tb.attack);
    out.gain.exponentialRampToValueAtTime(volume * tb.sustain, t + decayAt);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(tb.ceil, freq * tb.open), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * tb.close), t + duration);
    filter.connect(out).connect(master);
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    tb.harmonics.forEach((level, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 && kind !== 'bass' ? 'triangle' : 'sine';
      osc.frequency.value = freq * (i + 1) * (1 + i * 0.0007); // slight inharmonicity, like real strings
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.05);
      oscs.push(osc);
      gains.push(g);
    });

    let cleanup: ReturnType<typeof setTimeout> | null = null;
    const teardown = () => {
      if (cleanup !== null) clearTimeout(cleanup);
      cleanup = null;
      this.voices.delete(voice);
      for (const o of oscs) o.disconnect();
      for (const g of gains) g.disconnect();
      filter.disconnect();
      out.disconnect();
    };
    const voice: Voice = {
      start: t,
      end: t + duration,
      voice: kind,
      kill: (at) => {
        // Quick fade (no click), then the oscillators stop. A voice that never started may never fire
        // `onended`, so also disconnect after the fade on a timer.
        out.gain.cancelScheduledValues(at);
        out.gain.setTargetAtTime(0.0001, at, 0.008);
        for (const o of oscs) o.stop(at + 0.05);
        cleanup ??= setTimeout(teardown, KILL_CLEANUP_MS);
      },
    };
    this.voices.add(voice);
    oscs[0]!.onended = teardown;
    return voice;
  }
}
