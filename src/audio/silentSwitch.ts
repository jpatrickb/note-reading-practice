// iPhone's ring/silent switch mutes Web Audio but not an HTML media element. Playing a silent,
// looping <audio> element makes Safari treat the page as media playback, so Web Audio is heard.
// The clip is generated here (digital silence, about 1 KB), so there is no asset to precache.

export function silentWavDataUri(): string {
  const rate = 8000;
  const n = 800; // 0.1 s of 8-bit mono; 128 is the zero level for unsigned 8-bit PCM
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  tag(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true); // byte rate
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true);
  tag(36, 'data');
  v.setUint32(40, n, true);
  bytes.fill(128, 44);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export interface AudioElementLike {
  src: string;
  loop: boolean;
  volume: number;
  play(): Promise<void> | void;
  pause(): void;
  setAttribute?(name: string, value: string): void;
}

export class SilentSwitchKeepAlive {
  private el: AudioElementLike | null = null;
  private playing = false;

  constructor(private readonly make: () => AudioElementLike = () => new Audio()) {}

  /** Call inside a user gesture (a pointerdown). Safe to call repeatedly. */
  start(): void {
    if (this.playing) return;
    try {
      // Safari 16.4+: ask for the playback category directly. Harmless where unsupported.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      if (!this.el) {
        const el = this.make();
        el.src = silentWavDataUri();
        el.loop = true;
        el.volume = 0; // read-only on iOS (ignored there); the clip is digital silence regardless
        el.setAttribute?.('playsinline', '');
        this.el = el;
      }
      this.playing = true;
      const p = this.el.play();
      if (p && typeof p.catch === 'function') p.catch(() => (this.playing = false));
    } catch {
      this.playing = false;
    }
  }

  /** Pause when muted so we don't hold the media channel (or show Now Playing) for nothing. */
  stop(): void {
    this.playing = false;
    try {
      this.el?.pause();
    } catch {
      /* nothing to stop */
    }
  }

  get active(): boolean {
    return this.playing;
  }
}
