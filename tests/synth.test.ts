// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type NoteEvent } from '../src/audio/sequence';
import { SilentSwitchKeepAlive, silentWavDataUri } from '../src/audio/silentSwitch';
import { LOOKAHEAD, MAX_VOICES, Synth } from '../src/audio/synth';

class FakeParam {
  value = 0;
  calls: [string, ...number[]][] = [];
  setValueAtTime(v: number, t: number) { this.calls.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push(['ramp', v, t]); return this; }
  setTargetAtTime(v: number, t: number, k: number) { this.calls.push(['target', v, t, k]); return this; }
  cancelScheduledValues(t: number) { this.calls.push(['cancel', t]); return this; }
}

class FakeNode {
  connected = new Set<FakeNode>();
  live = true;
  connect<T extends FakeNode>(to: T): T { this.connected.add(to); return to; }
  disconnect() { this.connected.clear(); this.live = false; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { type = ''; frequency = new FakeParam(); }
class FakeOsc extends FakeNode {
  type = '';
  frequency = new FakeParam();
  startAt: number | null = null;
  stopAt: number | null = null;
  onended: (() => void) | null = null;
  start(t: number) { this.startAt = t; }
  stop(t: number) { this.stopAt = Math.min(this.stopAt ?? Infinity, t); }
}

class FakeContext {
  currentTime = 10;
  state = 'suspended';
  destination = new FakeNode();
  resume = vi.fn(() => { this.state = 'running'; return Promise.resolve(); });
  nodes: FakeNode[] = [];
  oscs: FakeOsc[] = [];
  private make<T extends FakeNode>(n: T): T { this.nodes.push(n); return n; }
  createGain() { return this.make(new FakeGain()); }
  createBiquadFilter() { return this.make(new FakeFilter()); }
  createOscillator() { const o = this.make(new FakeOsc()); this.oscs.push(o); return o; }
  /** Advance the audio clock; oscillators whose stop time has passed fire `onended`. */
  advance(s: number) {
    this.currentTime += s;
    for (const o of this.oscs) {
      if (o.live && o.stopAt !== null && o.stopAt <= this.currentTime) o.onended?.();
    }
  }
  get liveNodes() { return this.nodes.filter((n) => n.live && !(n === (this.nodes[0] as FakeNode))); }
}

function setup() {
  const ctx = new FakeContext();
  const keepAlive = { start: vi.fn(), stop: vi.fn() } as unknown as SilentSwitchKeepAlive;
  const synth = new Synth({ createContext: () => ctx as unknown as AudioContext, keepAlive });
  synth.unlock();
  return { ctx, synth, keepAlive: keepAlive as unknown as { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } };
}

const mel = (midi: number, beat: number, beats = 1, voice: NoteEvent['voice'] = 'melody'): NoteEvent => ({ midi, beat, beats, voice, vel: 1 });
const starts = (ctx: FakeContext) => ctx.oscs.map((o) => o.startAt!);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('single notes and fanfare keep their old behavior', () => {
  it('note() builds four partials at the same times as before', () => {
    const { ctx, synth } = setup();
    synth.note(440, 0.5, 1.4, 0.35);
    expect(ctx.oscs).toHaveLength(4);
    expect(ctx.oscs.map((o) => o.frequency.value)).toEqual([440, 880 * 1.0007, 1320 * 1.0014, 1760 * 1.0021].map((f) => expect.closeTo(f, 6)));
    expect(ctx.oscs.map((o) => o.type)).toEqual(['triangle', 'sine', 'sine', 'sine']);
    expect(starts(ctx)).toEqual([10.5, 10.5, 10.5, 10.5]);
    expect(ctx.oscs[0]!.stopAt).toBeCloseTo(10.5 + 1.4 + 0.05, 10);
    const env = (ctx.nodes[1] as FakeGain).gain.calls;
    expect(env).toEqual([['set', 0.0001, 10.5], ['ramp', 0.35, 10.508], ['ramp', 0.35 * 0.35, 10.75], ['ramp', 0.0001, 11.9]]);
  });

  it('fanfare plays 3 notes (silver) or 4 (gold), spaced 90 ms from 350 ms', () => {
    const a = setup();
    a.synth.fanfare(false);
    expect([...new Set(starts(a.ctx))].map((t) => +(t - 10).toFixed(3))).toEqual([0.35, 0.44, 0.53]);
    const b = setup();
    b.synth.fanfare(true);
    expect([...new Set(starts(b.ctx))].map((t) => +(t - 10).toFixed(3))).toEqual([0.35, 0.44, 0.53, 0.62]);
  });

  it('does nothing before unlock or while muted', () => {
    const ctx = new FakeContext();
    const cold = new Synth({ createContext: () => ctx as unknown as AudioContext });
    cold.note(440);
    cold.chord([60, 64]);
    expect(ctx.oscs).toHaveLength(0);
    const { ctx: c2, synth } = setup();
    synth.muted = true;
    synth.note(440);
    synth.chord([60, 64, 67]);
    synth.fanfare(true);
    expect(c2.oscs).toHaveLength(0);
  });

  it('unlock resumes a suspended context and tolerates no Web Audio', () => {
    const { ctx } = setup();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    const none = new Synth({ createContext: () => null });
    expect(() => {
      none.unlock();
      none.note(440);
      none.stopAll();
    }).not.toThrow();
    expect(none.playSequence([mel(60, 0)], { bpm: 100 }).stop).toBeTypeOf('function');
  });
});

describe('chord', () => {
  it('starts every note together at now + when with the soft timbre', () => {
    const { ctx, synth } = setup();
    synth.chord([60, 64, 67], 1, 2);
    expect(new Set(starts(ctx))).toEqual(new Set([11]));
    expect(ctx.oscs).toHaveLength(9); // 3 notes x 3 partials
    expect(ctx.oscs[0]!.frequency.value).toBeCloseTo(261.6256, 3);
  });
});

describe('playSequence scheduling', () => {
  it('schedules only the look-ahead window, then more as the clock moves', () => {
    const { ctx, synth } = setup();
    // 60 bpm: one note per second.
    synth.playSequence([mel(60, 0), mel(62, 1), mel(64, 2)], { bpm: 60 });
    const t0 = 10 + 0.06;
    expect(new Set(starts(ctx))).toEqual(new Set([t0])); // only note 0 is inside the window
    ctx.advance(0.9);
    vi.advanceTimersByTime(25);
    expect(new Set(starts(ctx))).toEqual(new Set([t0, t0 + 1])); // note 1 is now within LOOKAHEAD
    expect(LOOKAHEAD).toBeGreaterThan(0.1);
    ctx.advance(1);
    vi.advanceTimersByTime(25);
    expect(new Set(starts(ctx))).toEqual(new Set([t0, t0 + 1, t0 + 2]));
  });

  it('start times follow the tempo exactly and chords/bass share a start', () => {
    const { ctx, synth } = setup();
    synth.playSequence([mel(48, 0, 4, 'bass'), mel(60, 0, 4, 'chord'), mel(72, 0.5, 0.5)], { bpm: 120 });
    ctx.advance(0.3);
    vi.advanceTimersByTime(25);
    const t0 = 10.06;
    const bass = ctx.oscs.slice(0, 2); // 2 partials
    const chord = ctx.oscs.slice(2, 5); // 3 partials
    const melody = ctx.oscs.slice(5);
    expect(bass.every((o) => o.startAt === t0)).toBe(true);
    expect(chord.every((o) => o.startAt === t0)).toBe(true);
    expect(melody.every((o) => o.startAt === t0 + 0.25)).toBe(true);
  });

  it('calls onNote in score order as notes begin, with the caller indexes', () => {
    const { ctx, synth } = setup();
    const seen: number[] = [];
    synth.playSequence([mel(64, 1), mel(60, 0), mel(62, 0.5)], { bpm: 120, onNote: (i) => seen.push(i) });
    expect(seen).toEqual([]);
    ctx.advance(0.07);
    vi.advanceTimersByTime(25);
    expect(seen).toEqual([1]);
    ctx.advance(1);
    vi.advanceTimersByTime(25);
    expect(seen).toEqual([1, 2, 0]);
  });

  it('done resolves after the last note rings out, and the timer is released', async () => {
    const { ctx, synth } = setup();
    const h = synth.playSequence([mel(60, 0, 1)], { bpm: 60 });
    let resolved = false;
    void h.done.then(() => (resolved = true));
    ctx.advance(0.5);
    vi.advanceTimersByTime(25);
    await Promise.resolve();
    expect(resolved).toBe(false);
    ctx.advance(2);
    vi.advanceTimersByTime(25);
    await h.done;
    expect(resolved).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    ctx.advance(5);
    expect(ctx.liveNodes).toHaveLength(0);
  });

  it('muted or empty sequences schedule nothing and resolve at once', async () => {
    const { ctx, synth } = setup();
    await synth.playSequence([], { bpm: 100 }).done;
    synth.muted = true;
    await synth.playSequence([mel(60, 0)], { bpm: 100 }).done;
    expect(ctx.oscs).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an invalid tempo', () => {
    const { synth } = setup();
    expect(() => synth.playSequence([mel(60, 0)], { bpm: 0 })).toThrow(RangeError);
  });
});

describe('polyphony cap', () => {
  it('never has more than MAX_VOICES notes alive at once', () => {
    const { ctx, synth } = setup();
    for (let i = 0; i < MAX_VOICES + 8; i++) synth.note(220 + i, 0, 2);
    const alive = new Set(ctx.oscs.filter((o) => o.stopAt! > 10.2).map((o) => o.frequency.value));
    // Each note has 4 partials; stolen voices were told to stop within ~50 ms.
    expect(alive.size / 4).toBeLessThanOrEqual(MAX_VOICES);
    expect(ctx.oscs.filter((o) => o.stopAt! < 10.1)).toHaveLength(8 * 4);
  });

  it('drops a low-priority note rather than cutting the melody', () => {
    const { ctx, synth } = setup();
    for (let i = 0; i < MAX_VOICES; i++) synth.note(220 + i, 0, 2);
    const before = ctx.oscs.length;
    synth.chord([60], 0, 2); // chord cannot evict melody voices
    expect(ctx.oscs).toHaveLength(before);
    expect(ctx.oscs.every((o) => o.stopAt! > 12)).toBe(true);
  });

  it('frees room once notes have ended', () => {
    const { ctx, synth } = setup();
    for (let i = 0; i < MAX_VOICES; i++) synth.note(220 + i, 0, 1);
    ctx.advance(2);
    const before = ctx.oscs.length;
    synth.chord([60], 0, 1);
    expect(ctx.oscs.length).toBe(before + 3);
  });
});

describe('stop() and stopAll()', () => {
  it('stop() cancels future notes, fades live ones, clears the timer and leaves no nodes behind', async () => {
    const { ctx, synth } = setup();
    const h = synth.playSequence([mel(60, 0), mel(62, 1), mel(64, 2)], { bpm: 60 });
    const scheduled = ctx.oscs.length;
    ctx.advance(0.2);
    h.stop();
    expect(vi.getTimerCount()).toBe(0);
    await h.done;
    ctx.advance(0.1);
    vi.advanceTimersByTime(1000);
    expect(ctx.oscs).toHaveLength(scheduled); // nothing further was queued
    expect(ctx.oscs.every((o) => o.stopAt! <= ctx.currentTime)).toBe(true);
    expect(ctx.liveNodes).toHaveLength(0);
    h.stop(); // idempotent
  });

  it('stop() prevents any more onNote callbacks', () => {
    const { ctx, synth } = setup();
    const onNote = vi.fn();
    const h = synth.playSequence([mel(60, 1)], { bpm: 60, onNote });
    h.stop();
    ctx.advance(3);
    vi.advanceTimersByTime(500);
    expect(onNote).not.toHaveBeenCalled();
  });

  it('stopAll() silences notes, chords and every running sequence', async () => {
    const { ctx, synth } = setup();
    const a = synth.playSequence([mel(60, 0), mel(62, 4)], { bpm: 60 });
    const b = synth.playSequence([mel(48, 0, 8, 'bass')], { bpm: 60 });
    synth.note(440);
    synth.chord([60, 64], 5);
    ctx.advance(0.1);
    synth.stopAll();
    await Promise.all([a.done, b.done]);
    expect(vi.getTimerCount()).toBe(0);
    ctx.advance(0.1);
    expect(ctx.oscs.every((o) => o.stopAt! <= ctx.currentTime)).toBe(true);
    expect(ctx.liveNodes).toHaveLength(0);
    // And the synth is still usable afterwards.
    const n = ctx.oscs.length;
    synth.note(330);
    expect(ctx.oscs.length).toBe(n + 4);
  });

  it('muting mid-sequence stops it and releases the media channel; unmuting reclaims it', async () => {
    const { ctx, synth, keepAlive } = setup();
    expect(keepAlive.start).toHaveBeenCalledTimes(1);
    const h = synth.playSequence([mel(60, 0), mel(62, 3)], { bpm: 60 });
    synth.muted = true;
    await h.done;
    expect(keepAlive.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    ctx.advance(1);
    expect(ctx.liveNodes).toHaveLength(0);
    synth.muted = false;
    expect(keepAlive.start).toHaveBeenCalledTimes(2);
  });

  it('stopAll() before unlock is harmless', () => {
    const synth = new Synth({ createContext: () => null });
    expect(() => synth.stopAll()).not.toThrow();
  });
});

describe('silent-switch keep-alive', () => {
  function fakeEl() {
    return { src: '', loop: false, volume: 1, play: vi.fn(() => Promise.resolve()), pause: vi.fn(), setAttribute: vi.fn() };
  }

  it('the clip is a tiny valid silent WAV', () => {
    const uri = silentWavDataUri();
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(uri.length).toBeLessThan(2000);
    const bin = atob(uri.split(',')[1]!);
    expect(bin.slice(0, 4)).toBe('RIFF');
    expect(bin.slice(8, 12)).toBe('WAVE');
    expect([...bin.slice(44)].every((c) => c.charCodeAt(0) === 128)).toBe(true);
  });

  it('starts a looping element once, pauses when stopped, and restarts', () => {
    const el = fakeEl();
    const ka = new SilentSwitchKeepAlive(() => el);
    ka.start();
    ka.start();
    expect(el.play).toHaveBeenCalledTimes(1);
    expect(el.loop).toBe(true);
    expect(el.src).toContain('data:audio/wav');
    expect(ka.active).toBe(true);
    ka.stop();
    expect(el.pause).toHaveBeenCalled();
    expect(ka.active).toBe(false);
    ka.start();
    expect(el.play).toHaveBeenCalledTimes(2);
  });

  it('survives a rejected play() and a throwing element', async () => {
    const el = fakeEl();
    el.play.mockReturnValue(Promise.reject(new Error('NotAllowedError')));
    const ka = new SilentSwitchKeepAlive(() => el);
    ka.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(ka.active).toBe(false); // so the next gesture retries
    const bad = new SilentSwitchKeepAlive(() => {
      throw new Error('no Audio');
    });
    expect(() => bad.start()).not.toThrow();
    expect(() => bad.stop()).not.toThrow();
  });

  it('asks Safari for the playback audio session when available', () => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
    new SilentSwitchKeepAlive(() => fakeEl()).start();
    expect(session.type).toBe('playback');
    delete (navigator as unknown as { audioSession?: unknown }).audioSession;
  });
});
