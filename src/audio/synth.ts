// Tiny piano-ish synth on the Web Audio API. No samples to download, so it works offline.
// iOS only allows audio after a user gesture, so call unlock() from a tap/click handler.

export class Synth {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** A soft piano-like tone. */
  note(freq: number, when = 0, duration = 1.4, volume = 0.35): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + when;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    out.gain.exponentialRampToValueAtTime(volume * 0.35, t + 0.25);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(8000, freq * 8), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2), t + duration);
    filter.connect(out).connect(ctx.destination);
    [1, 2, 3, 4].forEach((h, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq * h * (1 + i * 0.0007); // slight inharmonicity, like real strings
      const g = ctx.createGain();
      g.gain.value = [1, 0.45, 0.2, 0.1][i]!;
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    });
  }

  /** Little rising arpeggio for mastery moments. */
  fanfare(gold: boolean): void {
    const base = gold ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    base.forEach((f, i) => this.note(f, 0.35 + i * 0.09, 0.9, 0.18));
  }
}
