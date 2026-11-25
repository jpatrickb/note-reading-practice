// One original mascot per theme, hand-drawn as SVG on a 120×120 grid. Every mascot shares one face
// rig (eyes, mouths, brows, cheeks) whose parts are shown or hidden by CSS from `data-mood`, so a
// mood change is a class flip, not a redraw. Motion (hop, cheer, tilt) uses the Web Animations API
// on the outer element only (transform), and is skipped in Calm mode.

import { reducedFx } from './fx';

export type Mood = 'idle' | 'thinking' | 'happy' | 'cheer' | 'encourage';

interface Face {
  cx: number;
  eyeY: number;
  mouthY: number;
  /** Distance between the eye centers. */
  gap: number;
  /** Eye radius. */
  r: number;
  eye: string;
  mouth?: string;
  /** Fill of the open (happy) mouth. */
  mouthFill?: string;
  tongue?: boolean;
  cheek?: string;
  cheekY?: number;
  glint?: boolean;
}

function face(f: Face): string {
  const { cx, eyeY: y, mouthY: my, gap, r } = f;
  const lx = cx - gap / 2;
  const rx = cx + gap / 2;
  const w = r * 1.15;
  const ink = f.mouth ?? f.eye;
  const sw = Math.max(2, r * 0.5).toFixed(1);
  const eye = (x: number) =>
    `<g class="f-eye" transform="translate(${x} ${y})"><g class="f-pupil"><ellipse rx="${r}" ry="${(r * 1.12).toFixed(1)}" fill="${f.eye}"/>` +
    (f.glint === false ? '' : `<circle cx="${(r * 0.35).toFixed(1)}" cy="${(-r * 0.4).toFixed(1)}" r="${(r * 0.38).toFixed(1)}" fill="#fff"/>`) +
    '</g></g>';
  const happyEye = (x: number) => `M${x - r} ${y + 1}Q${x} ${y - r * 1.5} ${x + r} ${y + 1}`;
  const brow = (x: number, dir: number) =>
    `M${x - r * dir} ${y - r - 3}Q${x} ${y - r - 6} ${x + r * dir} ${y - r - 7.5}`;
  const cheeks =
    f.cheek &&
    [lx - r * 0.9, rx + r * 0.9]
      .map((x) => `<ellipse class="f-cheek" cx="${x}" cy="${f.cheekY ?? y + r * 2}" rx="${(r * 0.95).toFixed(1)}" ry="${(r * 0.6).toFixed(1)}" fill="${f.cheek}"/>`)
      .join('');
  return (
    `<g class="f" stroke-linecap="round" stroke-linejoin="round">` +
    (cheeks || '') +
    `<g class="f-eyes f-eyes--open">${eye(lx)}${eye(rx)}</g>` +
    `<path class="f-eyes f-eyes--happy" d="${happyEye(lx)}${happyEye(rx)}" fill="none" stroke="${f.eye}" stroke-width="${sw}"/>` +
    `<path class="f-brows" d="${brow(lx, 1)}${brow(rx, -1)}" fill="none" stroke="${f.eye}" stroke-width="${(r * 0.38).toFixed(1)}"/>` +
    `<path class="f-mouth f-mouth--smile" d="M${cx - w} ${my}Q${cx} ${my + w * 0.9} ${cx + w} ${my}" fill="none" stroke="${ink}" stroke-width="${sw}"/>` +
    `<path class="f-mouth f-mouth--soft" d="M${cx - w * 0.75} ${my + 1}Q${cx} ${my + w * 0.45} ${cx + w * 0.75} ${my + 1}" fill="none" stroke="${ink}" stroke-width="${sw}"/>` +
    `<ellipse class="f-mouth f-mouth--o" cx="${cx + 1}" cy="${my + 2}" rx="${(w * 0.32).toFixed(1)}" ry="${(w * 0.4).toFixed(1)}" fill="${ink}"/>` +
    `<g class="f-mouth f-mouth--open"><path d="M${cx - w * 1.3} ${my - 1}Q${cx} ${my + w * 2.1} ${cx + w * 1.3} ${my - 1}Z" fill="${f.mouthFill ?? '#7a2e3a'}"/>` +
    (f.tongue === false ? '' : `<ellipse cx="${cx}" cy="${my + w * 0.68}" rx="${(w * 0.55).toFixed(1)}" ry="${(w * 0.28).toFixed(1)}" fill="#ff8a8a"/>`) +
    '</g></g>'
  );
}

/** Four-point sparkles that pop around the mascot when it cheers. */
const SPARKLES =
  '<g class="m-sparkles" fill="#ffd43b">' +
  [
    [12, 22, 7],
    [108, 20, 6],
    [106, 96, 5],
    [14, 92, 5],
  ]
    .map(([x, y, s]) => `<path d="M${x} ${y! - s!}Q${x} ${y} ${x! + s!} ${y}Q${x} ${y} ${x} ${y! + s!}Q${x} ${y} ${x! - s!} ${y}Q${x} ${y} ${x} ${y! - s!}Z"/>`)
    .join('') +
  '</g>';

const rays = () => {
  let out = '<g class="m-rays">';
  for (let i = 0; i < 12; i++) {
    const long = i % 2 === 0;
    out += `<path d="M${long ? '54 30 60 5 66 30' : '55.5 30 60 12 64.5 30'}Z" fill="${long ? '#ff922b' : '#ffa94d'}" stroke="${long ? '#ff922b' : '#ffa94d'}" stroke-width="5" stroke-linejoin="round" transform="rotate(${i * 30} 60 62)"/>`;
  }
  return out + '</g>';
};

/** Body art per theme (drawn under the face). */
const BODIES: Record<string, () => string> = {
  sunny: () =>
    rays() +
    '<circle cx="60" cy="62" r="38" fill="#ffd43b"/><circle cx="60" cy="62" r="36.5" fill="none" stroke="#fab005" stroke-width="3"/>' +
    '<ellipse cx="46" cy="44" rx="13" ry="7" fill="#fff" opacity=".4" transform="rotate(-32 46 44)"/>' +
    face({ cx: 60, eyeY: 58, mouthY: 72, gap: 26, r: 5.5, eye: '#4a2c17', cheek: '#ff8a5c', cheekY: 70 }),
  ocean: () =>
    '<g class="m-spout" stroke="#74c0fc" stroke-width="4" stroke-linecap="round" fill="none"><path d="M72 28C72 18 68 12 60 8M72 28C72 18 76 12 84 8M72 28V10"/></g>' +
    '<path d="M18 72C10 64 4 54 2 42 10 44 16 48 20 54 20 44 24 36 32 32 32 44 30 58 26 68Z" fill="#339af0"/>' +
    '<path d="M10 72C10 46 32 30 62 30S112 48 112 72 92 104 62 104 10 96 10 72Z" fill="#4dabf7"/>' +
    '<path d="M22 86C40 100 88 102 109 82 104 96 86 104 62 104 42 104 28 98 22 86Z" fill="#d0ebff"/>' +
    '<path d="M50 88C46 98 38 104 30 105 36 98 40 92 42 85Z" fill="#339af0"/>' +
    '<ellipse cx="48" cy="44" rx="15" ry="6" fill="#fff" opacity=".3" transform="rotate(-18 48 44)"/>' +
    face({ cx: 78, eyeY: 62, mouthY: 76, gap: 24, r: 5.5, eye: '#0b2e3f', cheek: '#ff8fab', cheekY: 73 }),
  forest: () =>
    '<path d="M22 48 30 6 56 30ZM98 48 90 6 64 30Z" fill="#f76707"/>' +
    '<path d="M30 38 33 17 47 31ZM90 38 87 17 73 31Z" fill="#ffe8cc"/>' +
    '<path d="M14 56C14 36 34 26 60 26S106 36 106 56C106 78 88 98 60 106 32 98 14 78 14 56Z" fill="#fd7e14"/>' +
    '<path d="M17 61C32 61 47 70 60 82 73 70 88 61 103 61 99 84 83 100 60 106 37 100 21 84 17 61Z" fill="#fff4e6"/>' +
    '<ellipse cx="60" cy="84" rx="6.5" ry="4.8" fill="#2b2a33"/><circle cx="58" cy="82.6" r="1.6" fill="#fff" opacity=".8"/>' +
    face({ cx: 60, eyeY: 57, mouthY: 91, gap: 30, r: 5.5, eye: '#2b2a33', cheek: '#ff9b9b', cheekY: 72 }),
  candy: () =>
    '<g><circle cx="27" cy="46" r="12" fill="#ff8fab"/><circle cx="19" cy="63" r="11" fill="#ffc078"/><circle cx="21" cy="80" r="10" fill="#8ce99a"/><circle cx="30" cy="95" r="9" fill="#74c0fc"/></g>' +
    '<path d="M34 42 34 14 51 30ZM86 42 86 14 69 30Z" fill="#fff" stroke="#f0bcd6" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M37 34 37 21 46 30ZM83 34 83 21 74 30Z" fill="#ffc9de"/>' +
    '<path d="M22 64C22 40 40 28 60 28S98 40 98 64 80 106 60 106 22 90 22 64Z" fill="#fff" stroke="#f0bcd6" stroke-width="2.5"/>' +
    '<circle cx="45" cy="33" r="9" fill="#b197fc"/><circle cx="35" cy="40" r="7" fill="#ff8fab"/>' +
    '<path d="M60 2 69 30Q60 34 51 30Z" fill="#ffd43b" stroke="#f59f00" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M54.5 22 66 18M56.5 14 63.5 11" stroke="#f59f00" stroke-width="2" stroke-linecap="round"/>' +
    '<ellipse cx="60" cy="89" rx="22" ry="13" fill="#ffe3ef"/>' +
    '<ellipse cx="51" cy="88" rx="2" ry="3" fill="#e599b8"/><ellipse cx="69" cy="88" rx="2" ry="3" fill="#e599b8"/>' +
    face({ cx: 60, eyeY: 62, mouthY: 95, gap: 30, r: 6, eye: '#3d1f3a', cheek: '#ff9ec4', cheekY: 75 }),
  space: () =>
    '<line x1="60" y1="22" x2="60" y2="10" stroke="#adb5bd" stroke-width="4" stroke-linecap="round"/><circle class="m-light" cx="60" cy="8" r="5.5" fill="#ff6b6b"/>' +
    '<rect x="7" y="47" width="13" height="24" rx="5.5" fill="#adb5bd"/><rect x="100" y="47" width="13" height="24" rx="5.5" fill="#adb5bd"/>' +
    '<g class="m-arm m-arm--l"><rect x="20" y="96" width="19" height="9" rx="4.5" fill="#ced4da"/></g>' +
    '<g class="m-arm m-arm--r"><rect x="81" y="96" width="19" height="9" rx="4.5" fill="#ced4da"/></g>' +
    '<rect x="36" y="92" width="48" height="24" rx="10" fill="#dee2e6"/><circle cx="60" cy="104" r="4.5" fill="#ffd43b"/>' +
    '<rect x="16" y="20" width="88" height="74" rx="32" fill="#f1f3f5" stroke="#ced4da" stroke-width="2"/>' +
    '<rect x="26" y="33" width="68" height="49" rx="22" fill="#1c2042"/>' +
    '<path d="M35 42Q41 37 51 37" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".4"/>' +
    face({ cx: 60, eyeY: 56, mouthY: 68, gap: 26, r: 6, eye: '#63e6be', mouthFill: '#63e6be', tongue: false, cheek: '#ff8787', cheekY: 66, glint: false }),
  studio: () =>
    '<circle cx="60" cy="62" r="40" fill="#27272a"/>' +
    '<circle cx="60" cy="62" r="35" fill="none" stroke="#3f3f46" stroke-width="1.5"/><circle cx="60" cy="62" r="30" fill="none" stroke="#3f3f46" stroke-width="1.5"/>' +
    '<path class="m-shine" d="M27 44A38 38 0 0 1 45 26.5" stroke="#71717a" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '<circle cx="60" cy="64" r="24" fill="#60a5fa"/>' +
    '<path d="M15 62C15 6 105 6 105 62" stroke="#18181b" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<rect x="5" y="48" width="17" height="29" rx="7" fill="#18181b"/><rect x="16" y="53" width="5" height="19" rx="2.5" fill="#3b82f6"/>' +
    '<rect x="98" y="48" width="17" height="29" rx="7" fill="#18181b"/><rect x="99" y="53" width="5" height="19" rx="2.5" fill="#3b82f6"/>' +
    face({ cx: 60, eyeY: 60, mouthY: 70, gap: 17, r: 3.6, eye: '#0f172a', cheek: '#f9a8d4', cheekY: 68 }),
};

export const MASCOT_THEMES = Object.keys(BODIES);

/** Mascot as a <div class="mascot" data-mood>. `alive` adds idle motion (blinks, breathing), off in Calm mode. */
export function renderMascot(themeId: string, opts: { mood?: Mood; alive?: boolean; label?: string; cls?: string } = {}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `mascot mascot--${BODIES[themeId] ? themeId : 'sunny'}${opts.alive ? ' mascot--alive' : ''} ${opts.cls ?? ''}`.trim();
  wrap.dataset.mood = opts.mood ?? 'idle';
  if (opts.label) {
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', opts.label);
  } else wrap.setAttribute('aria-hidden', 'true');
  const body = (BODIES[themeId] ?? BODIES.sunny!)();
  wrap.innerHTML = `<svg class="mascot__svg" viewBox="0 0 120 120" focusable="false">${body}${SPARKLES}</svg>`;
  return wrap;
}

const MOTIONS: Partial<Record<Mood, { frames: Keyframe[]; ms: number }>> = {
  // A quick hop with a little squash: reads as "yes!" and fits well inside the 700 ms auto-advance.
  happy: {
    ms: 420,
    frames: [
      { transform: 'translateY(0) scale(1, 1)' },
      { transform: 'translateY(-16%) scale(0.96, 1.05)', offset: 0.4 },
      { transform: 'translateY(0) scale(1.06, 0.94)', offset: 0.75 },
      { transform: 'translateY(0) scale(1, 1)' },
    ],
  },
  // Two jumps and a wiggle, for new silver/gold only (fits the 1.6 s mastery pause).
  cheer: {
    ms: 1050,
    frames: [
      { transform: 'translateY(0) rotate(0) scale(1)' },
      { transform: 'translateY(-24%) rotate(-8deg) scale(1.08)', offset: 0.22 },
      { transform: 'translateY(0) rotate(0) scale(1.02, 0.95)', offset: 0.42 },
      { transform: 'translateY(-20%) rotate(8deg) scale(1.08)', offset: 0.64 },
      { transform: 'translateY(0) rotate(0) scale(1.03, 0.96)', offset: 0.86 },
      { transform: 'translateY(0) rotate(0) scale(1)' },
    ],
  },
  // A small, kind head tilt: deliberately less motion than a correct answer (no hop, no sparkles).
  encourage: {
    ms: 360,
    frames: [{ transform: 'rotate(0)' }, { transform: 'rotate(-5deg)', offset: 0.45 }, { transform: 'rotate(0)' }],
  },
};

/** Change the mascot's mood; returns how long its reaction animation runs (0 when calm or static). */
export function setMood(el: HTMLElement, mood: Mood): number {
  el.dataset.mood = mood;
  const motion = MOTIONS[mood];
  if (!motion || reducedFx() || typeof el.animate !== 'function') return 0;
  el.getAnimations?.().forEach((a) => a.cancel());
  el.animate(motion.frames, { duration: motion.ms, easing: 'cubic-bezier(.3,.7,.4,1)' });
  return motion.ms;
}

export const MOOD_MS = { happy: MOTIONS.happy!.ms, cheer: MOTIONS.cheer!.ms, encourage: MOTIONS.encourage!.ms };
