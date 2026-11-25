// iPhone's ring/silent switch mutes Web Audio but not an HTML media element. Playing a silent,
// looping <audio> element makes Safari treat the page as media playback, so Web Audio is heard.
// The clip is generated here (digital silence, about 11 KB as base64), so there is no asset to precache.

export function silentWavDataUri(): string {
  const rate = 8000;
  const n = 8000; // 1 s of 8-bit mono; 128 is the zero level for unsigned 8-bit PCM
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

interface AudioSessionLike {
  type: string;
}

export interface KeepAliveDeps {
  make?: () => AudioElementLike;
  /** Only iPhone/iPod have the ring/silent switch; iPads (which may report as Mac) and others must not run this. */
  isIPhone?: () => boolean;
  session?: () => AudioSessionLike | undefined;
  /** Idle time (ms) with no sound activity before the media channel is released. */
  idleMs?: number;
}

export const IDLE_MS = 30_000;

export function detectIPhone(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Keeps the iPhone media channel open while sound is wanted, and releases it otherwise:
 * - only on iPhone/iPod;
 * - where `navigator.audioSession` exists (Safari 16.4+) it is used alone (type 'playback');
 *   the silent <audio> element is the fallback for older iOS;
 * - released when muted, when the page is hidden, and after IDLE_MS without sound activity,
 *   resetting the session to 'auto' so the kid's own music app is not interrupted;
 * - restarted by `touch()` (any note or unlock) or when the page becomes visible again.
 */
export class SilentSwitchKeepAlive {
  private el: AudioElementLike | null = null;
  private playing = false;
  /** Sound is allowed (unlocked and not muted). */
  private wanted = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly make: () => AudioElementLike;
  private readonly isIPhone: () => boolean;
  private readonly session: () => AudioSessionLike | undefined;
  private readonly idleMs: number;

  constructor(deps: KeepAliveDeps = {}) {
    this.make = deps.make ?? (() => new Audio());
    this.isIPhone = deps.isIPhone ?? detectIPhone;
    this.session = deps.session ?? (() => (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession);
    this.idleMs = deps.idleMs ?? IDLE_MS;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.halt();
        else if (this.wanted) this.run();
      });
    }
  }

  /** Call inside a user gesture (a pointerdown) when sound is on. Safe to call repeatedly. */
  start(): void {
    this.wanted = true;
    this.run();
  }

  /** Muted: release everything. */
  stop(): void {
    this.wanted = false;
    this.halt();
  }

  /** Sound activity: keep (or bring back) the channel and restart the idle countdown. */
  touch(): void {
    if (!this.wanted) return;
    if (!this.playing) this.run();
    else this.armIdle();
  }

  get active(): boolean {
    return this.playing;
  }

  private armIdle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.halt(); // `wanted` stays true: the next touch()/start() brings it back
    }, this.idleMs);
  }

  private run(): void {
    if (!this.isIPhone() || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    this.armIdle();
    if (this.playing) return;
    try {
      const session = this.session();
      if (session) {
        session.type = 'playback';
        this.playing = true;
        return;
      }
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

  private halt(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const was = this.playing;
    this.playing = false;
    try {
      this.el?.pause();
      const session = this.session();
      if (session && was) session.type = 'auto';
    } catch {
      /* nothing to stop */
    }
  }
}
