// Feedback "juice": themed particle bursts on one small canvas, and the flying key for new mastery.
//
// Guardrails (see the PR's proposed decisions):
// - Size follows real progress: a correct answer gets a small, short burst; only new silver/gold gets
//   confetti. Wrong / "?" get no particles at all (wrong must never be more fun than right).
// - Everything fits inside the existing pauses (≈700 ms after a correct answer, 1.6 s for mastery).
// - Calm mode (setting or OS reduced motion) turns all of it off.
// - Particles are capped, drawn on one canvas, and the loop stops as soon as the last one fades.
//
// For tests and tuning, every reaction is recorded on the canvas element as data attributes:
// data-last-kind, data-last-particles, data-last-ms (total visual duration), data-active.

export type Reaction = 'correct' | 'wrong' | 'idk' | 'silver' | 'gold';

type Shape = 'circle' | 'bubble' | 'star' | 'spark' | 'leaf' | 'sprinkle' | 'heart' | 'ring' | 'confetti';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  age: number;
  life: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  shape: Shape;
}

interface ThemeFx {
  shapes: Shape[];
  colors: string[];
  /** px/s² (negative floats up, like bubbles). */
  gravity: number;
}

export const THEME_FX: Record<string, ThemeFx> = {
  sunny: { shapes: ['spark', 'circle'], colors: ['#ffd43b', '#ff922b', '#ff6b6b', '#51cf66', '#4dabf7'], gravity: 900 },
  ocean: { shapes: ['bubble'], colors: ['#4dabf7', '#74c0fc', '#a5d8ff', '#15aabf'], gravity: -420 },
  forest: { shapes: ['leaf'], colors: ['#69db7c', '#94d82d', '#ffa94d', '#fab005', '#40c057'], gravity: 520 },
  candy: { shapes: ['sprinkle', 'heart'], colors: ['#ff8fab', '#fcc419', '#69db7c', '#4dabf7', '#9775fa'], gravity: 820 },
  space: { shapes: ['star'], colors: ['#ffe066', '#ffffff', '#74c0fc', '#b197fc'], gravity: 320 },
  studio: { shapes: ['circle', 'ring'], colors: ['#3b82f6', '#18181b', '#a1a1aa', '#60a5fa'], gravity: 760 },
};

const MEDAL_COLORS = {
  silver: ['#e9ecef', '#adb5bd', '#ced4da', '#f8f9fa'],
  gold: ['#ffe066', '#fcc419', '#f59f00', '#fff3bf'],
};

/** Particle budgets per reaction. Wrong / "?" deliberately get none. */
export const BURST = {
  correct: { count: 14, ms: 560 },
  silver: { count: 44, confetti: 40, ms: 1350 },
  gold: { count: 56, confetti: 64, ms: 1450 },
} as const;
export const MAX_PARTICLES = 160;

const reduceQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** True when Calm mode is on (user setting) or the OS asks for reduced motion. */
export function reducedFx(): boolean {
  return document.documentElement.dataset.calm === 'true' || !!reduceQuery?.matches;
}

export function prefersReducedMotion(): boolean {
  return !!reduceQuery?.matches;
}

export function onReducedMotionChange(fn: () => void): void {
  reduceQuery?.addEventListener?.('change', fn);
}

let layer: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf = 0;
let last = 0;
let dpr = 1;

function ensureLayer(): HTMLCanvasElement {
  if (layer?.isConnected) return layer;
  layer = document.createElement('canvas');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.active = '0';
  document.body.append(layer);
  ctx = null;
  return layer;
}

function size(): void {
  const c = ensureLayer();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  ctx ??= c.getContext('2d');
}

/** Record what the last reaction looked like (used by e2e tests to check the guardrails). */
export function record(kind: Reaction, count: number, ms: number): void {
  const c = ensureLayer();
  c.dataset.lastKind = kind;
  c.dataset.lastParticles = String(count);
  c.dataset.lastMs = String(Math.round(ms));
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

function themeFx(): ThemeFx {
  return THEME_FX[document.documentElement.dataset.theme ?? ''] ?? THEME_FX.sunny!;
}

function spawn(p: Omit<Particle, 'age'>): void {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push({ ...p, age: 0 });
}

/** A radial burst from the middle of `from`. Returns the number of particles added. */
function burstFrom(from: DOMRect, count: number, lifeMs: number, speed: [number, number], colors?: readonly string[]): number {
  const t = themeFx();
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const before = particles.length;
  for (let i = 0; i < count; i++) {
    // Mostly upward fan so particles clear the finger and stay away from the staff above the pad.
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const v = rand(speed[0], speed[1]);
    spawn({
      x: cx + rand(-from.width / 4, from.width / 4),
      y: cy + rand(-6, 6),
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * (t.gravity < 0 ? 0.55 : 1),
      g: t.gravity,
      life: rand(lifeMs * 0.7, lifeMs),
      rot: rand(0, Math.PI * 2),
      vr: rand(-8, 8),
      size: rand(5, 9),
      color: pick(colors ?? t.colors),
      shape: pick(t.shapes),
    });
  }
  return particles.length - before;
}

/** Confetti raining from the top edge (mastery moments only). */
function confetti(count: number, lifeMs: number, medal: 'silver' | 'gold'): number {
  const t = themeFx();
  const w = window.innerWidth;
  const before = particles.length;
  for (let i = 0; i < count; i++) {
    spawn({
      x: rand(0, w),
      y: rand(-40, -10),
      vx: rand(-60, 60),
      vy: rand(180, 380),
      g: 260,
      life: rand(lifeMs * 0.8, lifeMs),
      rot: rand(0, Math.PI * 2),
      vr: rand(-10, 10),
      size: rand(6, 10),
      color: i % 2 ? pick(MEDAL_COLORS[medal]) : pick(t.colors),
      shape: i % 3 === 0 ? pick(t.shapes) : 'confetti',
    });
  }
  return particles.length - before;
}

function star(c: CanvasRenderingContext2D, r: number, points: number, inner: number): void {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = (i * Math.PI) / points - Math.PI / 2;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

function draw(c: CanvasRenderingContext2D, p: Particle): void {
  const s = p.size;
  c.fillStyle = p.color;
  c.strokeStyle = p.color;
  switch (p.shape) {
    case 'circle':
      c.beginPath();
      c.arc(0, 0, s * 0.55, 0, Math.PI * 2);
      c.fill();
      break;
    case 'bubble':
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha *= 0.7;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(-s * 0.3, -s * 0.3, s * 0.22, 0, Math.PI * 2);
      c.fill();
      break;
    case 'star':
      star(c, s * 0.9, 5, 0.45);
      break;
    case 'spark':
      star(c, s, 4, 0.3);
      break;
    case 'leaf':
      c.beginPath();
      c.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.18)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, -s);
      c.lineTo(0, s);
      c.stroke();
      break;
    case 'sprinkle':
      c.beginPath();
      c.roundRect?.(-s * 0.2, -s * 0.75, s * 0.4, s * 1.5, s * 0.2);
      c.fill();
      break;
    case 'heart':
      c.beginPath();
      c.moveTo(0, s * 0.6);
      c.bezierCurveTo(-s, -s * 0.1, -s * 0.5, -s, 0, -s * 0.35);
      c.bezierCurveTo(s * 0.5, -s, s, -s * 0.1, 0, s * 0.6);
      c.fill();
      break;
    case 'ring':
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, s * 0.6, 0, Math.PI * 2);
      c.stroke();
      break;
    case 'confetti':
      c.fillRect(-s * 0.5, -s * 0.28, s, s * 0.56);
      break;
  }
}

function frame(t: number): void {
  const c = ctx;
  if (!c || !layer) return;
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, layer.width, layer.height);
  particles = particles.filter((p) => (p.age += dt * 1000) < p.life);
  for (const p of particles) {
    p.vy += p.g * dt;
    p.vx *= 0.985;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const k = p.age / p.life;
    c.globalAlpha = k > 0.65 ? Math.max(0, 1 - (k - 0.65) / 0.35) : 1;
    c.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
    c.rotate(p.rot);
    draw(c, p);
  }
  layer.dataset.active = String(particles.length);
  if (particles.length) raf = requestAnimationFrame(frame);
  else {
    raf = 0;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, layer.width, layer.height);
  }
}

function run(): void {
  if (!raf && particles.length) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

/** Correct answer: a small themed burst from the button. Returns the particle count (0 when calm). */
export function correctBurst(from: Element): number {
  if (reducedFx()) return 0;
  size();
  if (!ctx) return 0;
  const n = burstFrom(from.getBoundingClientRect(), BURST.correct.count, BURST.correct.ms, [220, 460]);
  run();
  return n;
}

/** New silver/gold: a bigger burst from the button plus confetti from the top. */
export function masteryBurst(from: Element, medal: 'silver' | 'gold'): number {
  if (reducedFx()) return 0;
  size();
  if (!ctx) return 0;
  const b = BURST[medal];
  const n =
    burstFrom(from.getBoundingClientRect(), b.count, b.ms * 0.8, [320, 680], [...MEDAL_COLORS[medal], ...themeFx().colors]) +
    confetti(b.confetti, b.ms, medal);
  run();
  return n;
}

/** A celebratory shower for the summary screen (only when the session earned new silver/gold). */
export function summaryShower(medal: 'silver' | 'gold'): number {
  if (reducedFx()) return 0;
  size();
  if (!ctx) return 0;
  const n = confetti(BURST[medal].confetti + 20, 2200, medal);
  run();
  return n;
}

/** Stop and clear everything (on leaving a screen). */
export function clearFx(): void {
  particles = [];
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (layer && ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
    layer.dataset.active = '0';
  }
  document.querySelectorAll('.fly-key').forEach((n) => n.remove());
}

const SVG_KEY = (letter: string) =>
  `<svg viewBox="0 0 40 64" aria-hidden="true"><rect x="2" y="2" width="36" height="60" rx="7" class="fly-key__body"/>` +
  `<path d="M9 8h6v20H9z" class="fly-key__shine"/><text x="20" y="52" class="fly-key__letter">${letter}</text></svg>`;

/**
 * New mastery: a silver/gold piano key pops out of the answer button, grows, then flies into the
 * trophy (the kid's keyboard) in the top bar. Returns the duration in ms (0 when calm).
 */
export function flyKey(from: Element, to: Element | null, letter: string, medal: 'silver' | 'gold', onLand?: () => void): number {
  if (reducedFx() || !to || typeof document.body.animate !== 'function') {
    onLand?.();
    return 0;
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const key = document.createElement('div');
  key.className = `fly-key fly-key--${medal}`;
  key.innerHTML = SVG_KEY(letter.replace(/[^A-G]/g, '').slice(0, 1) || '★');
  const x0 = a.left + a.width / 2 - 20;
  const y0 = a.top + a.height / 2 - 32;
  const dx = b.left + b.width / 2 - 20 - x0;
  const dy = b.top + b.height / 2 - 32 - y0;
  key.style.left = `${x0}px`;
  key.style.top = `${y0}px`;
  document.body.append(key);
  const ms = 1000;
  const anim = key.animate(
    [
      { transform: 'translate(0, 0) scale(0.4) rotate(0)', opacity: 0 },
      { transform: 'translate(0, -70px) scale(1.5) rotate(-8deg)', opacity: 1, offset: 0.28 },
      { transform: `translate(${dx * 0.25}px, -96px) scale(1.5) rotate(6deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.45) rotate(0)`, opacity: 0.9 },
    ],
    { duration: ms, easing: 'cubic-bezier(.45,.05,.4,1)' },
  );
  const done = () => {
    key.remove();
    to.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: 360, easing: 'ease-out' },
    );
    onLand?.();
  };
  anim.onfinish = done;
  anim.oncancel = () => key.remove();
  return ms + 360;
}

/** A tiny "pop" on an element (answer button, check mark). Transform only. */
export function pop(el: Element, scale = 1.1, ms = 240): number {
  if (reducedFx() || typeof (el as HTMLElement).animate !== 'function') return 0;
  (el as HTMLElement).animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.4 }, { transform: 'scale(1)' }], {
    duration: ms,
    easing: 'ease-out',
  });
  return ms;
}

/** A small sideways nudge for the wrong key: brief and low-amplitude on purpose. */
export function nudge(el: Element): number {
  if (reducedFx() || typeof (el as HTMLElement).animate !== 'function') return 0;
  const ms = 260;
  (el as HTMLElement).animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
    { duration: ms, easing: 'ease-in-out' },
  );
  return ms;
}
