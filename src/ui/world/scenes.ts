// Illustrated worlds, one per theme: original, hand-authored SVG (no images, no downloads).
//
// A scene is a static ground strip anchored to the bottom of the screen plus a few "sprites": small
// separate SVGs that may drift, bob or twinkle. Each sprite is its own element so the browser can
// animate it with a compositor-only transform/opacity (smooth on older iPads).
//
// Sprites live in a zone. During a question only the low "ground" zone may move (and only when it is
// clear of the staff); "sky" sprites hold still so nothing moves behind or around what the kid reads.

export type Zone = 'sky' | 'ground';

export interface Sprite {
  zone: Zone;
  vb: string;
  art: string;
  /** Inline placement CSS (left/top/bottom/width…). */
  pos: string;
  /** Outer motion class (amb--cross, amb--rise…); none = static art. */
  move?: string;
  /** Inner motion class (amb--bob, amb--flap…). */
  inner?: string;
  /** Seconds for the outer / inner motion, and a start offset (negative = already under way). */
  dur?: number;
  dur2?: number;
  delay?: number;
  /** Only on wide screens (it would just peek out from behind the content on an iPad or phone). */
  wide?: boolean;
}

export interface Scene {
  ground: string;
  sprites: Sprite[];
}

const GROUND_VB = '0 0 1600 400';
export const groundViewBox = GROUND_VB;

// ───────────────────────── shared bits ─────────────────────────

/** Deterministic pseudo-random numbers, so scenes look the same on every visit. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const mirror = (w: number, art: string) => `<g transform="translate(${w} 0) scale(-1 1)">${art}</g>`;

const cloud = (fill: string, shade: string) =>
  `<path d="M22 56a17 17 0 0 1 6-33 24 24 0 0 1 45-8 18 18 0 0 1 27 13 14 14 0 0 1 2 28z" fill="${fill}"/>` +
  `<path d="M24 56h78a14 14 0 0 0 4-9c-8 6-70 8-86 1z" fill="${shade}"/>`;

const sparkle = (c: string) => `<path d="M10 0Q10 10 20 10Q10 10 10 20Q10 10 0 10Q10 10 10 0Z" fill="${c}"/>`;

// ───────────────────────── Sunny: rolling hills, a cottage, flowers ─────────────────────────

function sunnyGround(): string {
  const r = rng(7);
  let flowers = '';
  const colors = ['#ff6b6b', '#ffa94d', '#f783ac', '#ffffff', '#fcc419', '#9775fa'];
  for (let i = 0; i < 34; i++) {
    const x = 20 + i * 47 + r() * 20;
    const y = 352 + r() * 34;
    const c = colors[i % colors.length]!;
    flowers +=
      i % 3 === 0
        ? `<circle cx="${x}" cy="${y - 10}" r="7" fill="#fff"/><circle cx="${x}" cy="${y - 10}" r="3" fill="#fcc419"/>`
        : `<path d="M${x} ${y}v-18" stroke="#4f9a3c" stroke-width="3"/><path d="M${x - 7} ${y - 26}q0 10 7 10q7 0 7-10l-3.5 4-3.5-6-3.5 6z" fill="${c}"/>`;
  }
  const tree = (x: number, y: number, s: number) =>
    `<rect x="${x - 5 * s}" y="${y}" width="${10 * s}" height="${34 * s}" rx="${3 * s}" fill="#9c6b3c"/>` +
    `<circle cx="${x}" cy="${y - 8 * s}" r="${30 * s}" fill="#6fb85a"/><circle cx="${x - 20 * s}" cy="${y + 4 * s}" r="${20 * s}" fill="#6fb85a"/>` +
    `<circle cx="${x + 21 * s}" cy="${y + 3 * s}" r="${22 * s}" fill="#5aa64a"/><circle cx="${x - 9 * s}" cy="${y - 18 * s}" r="${11 * s}" fill="#8fcf72"/>`;
  return (
    `<path d="M0 238C200 178 380 190 560 230 760 276 920 200 1120 190 1300 182 1460 222 1600 205V400H0Z" fill="#d3ecb0"/>` +
    tree(250, 200, 1) +
    tree(1450, 196, 0.8) +
    // the cottage
    `<g transform="translate(860 168)"><rect x="0" y="22" width="84" height="56" rx="4" fill="#fff3d6"/><path d="M-10 26 42-14 94 26Z" fill="#e8590c"/>` +
    `<path d="M-10 26 42-14 94 26" fill="none" stroke="#c2410c" stroke-width="5" stroke-linejoin="round"/><rect x="58" y="-8" width="12" height="22" fill="#c2410c"/>` +
    `<rect x="34" y="44" width="18" height="34" rx="9" fill="#9c6b3c"/><rect x="10" y="38" width="16" height="16" rx="3" fill="#8fd3ff"/><rect x="60" y="38" width="16" height="16" rx="3" fill="#8fd3ff"/></g>` +
    `<path d="M0 292C180 252 360 242 540 277 720 312 900 262 1080 254 1280 246 1440 292 1600 272V400H0Z" fill="#a8db86"/>` +
    `<path d="M700 400C760 340 860 300 902 248" stroke="#f1e2b6" stroke-width="26" fill="none" stroke-linecap="round"/>` +
    tree(560, 248, 0.7) +
    `<path d="M0 342C220 316 420 328 640 348 860 368 1080 328 1300 333 1440 336 1540 348 1600 343V400H0Z" fill="#86c96b"/>` +
    flowers
  );
}

const sunny: Scene = {
  ground: sunnyGround(),
  sprites: [
    {
      zone: 'sky',
      vb: '0 0 200 200',
      pos: 'top:-56px;right:-56px;width:min(34vw,220px);opacity:.85',
      move: 'amb--spin',
      dur: 120,
      art:
        '<g fill="#ffd43b" opacity=".55">' +
        Array.from({ length: 12 }, (_, i) => `<rect x="94" y="4" width="12" height="34" rx="6" transform="rotate(${i * 30} 100 100)"/>`).join('') +
        '</g><circle cx="100" cy="100" r="54" fill="#ffe066" opacity=".9"/><circle cx="100" cy="100" r="44" fill="#ffd43b"/>',
    },
    { zone: 'sky', vb: '0 0 110 62', pos: 'top:9%;left:0;width:150px;opacity:.95', move: 'amb--cross', dur: 150, delay: -40, art: cloud('#fff', '#f6ead6') },
    { zone: 'sky', vb: '0 0 110 62', pos: 'top:21%;left:0;width:110px;opacity:.85', move: 'amb--cross', dur: 190, delay: -130, art: cloud('#fff', '#f6ead6') },
    { zone: 'sky', vb: '0 0 110 62', pos: 'top:33%;left:0;width:180px;opacity:.8', move: 'amb--cross', dur: 240, delay: -60, art: cloud('#fff', '#f6ead6') },
    {
      zone: 'sky',
      vb: '0 0 30 16',
      pos: 'top:15%;left:0;width:34px',
      move: 'amb--cross',
      dur: 46,
      delay: -12,
      inner: 'amb--flap',
      dur2: 0.5,
      art: '<path d="M2 11Q8 2 15 10Q22 2 28 11" stroke="#7a5c45" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    },
    {
      zone: 'sky',
      vb: '0 0 30 16',
      pos: 'top:19%;left:0;width:26px',
      move: 'amb--cross',
      dur: 52,
      delay: -15,
      inner: 'amb--flap',
      dur2: 0.42,
      art: '<path d="M2 11Q8 2 15 10Q22 2 28 11" stroke="#7a5c45" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    },
    ...[
      ['left:16%;bottom:15%', '#f783ac', '#cc5de8', -2],
      ['right:14%;bottom:21%', '#ffa94d', '#fcc419', -5],
    ].map(
      ([pos, a, b, d]): Sprite => ({
        zone: 'ground',
        vb: '0 0 30 26',
        pos: `${pos};width:28px`,
        move: 'amb--wander',
        dur: 9,
        delay: d as number,
        inner: 'amb--flutter',
        dur2: 0.35,
        art: `<ellipse cx="9" cy="9" rx="8" ry="7" fill="${a}"/><ellipse cx="21" cy="9" rx="8" ry="7" fill="${a}"/><ellipse cx="10" cy="19" rx="6" ry="5" fill="${b}"/><ellipse cx="20" cy="19" rx="6" ry="5" fill="${b}"/><rect x="13.5" y="4" width="3" height="20" rx="1.5" fill="#5c4033"/>`,
      }),
    ),
  ],
};

// ───────────────────────── Ocean: seabed, coral, fish, light rays ─────────────────────────

const fish = (body: string, fin: string) =>
  `<path d="M54 20C46 8 26 6 14 20 26 34 46 32 54 20Z" fill="${body}"/><path d="M15 20 2 9 5 20 2 31Z" fill="${fin}"/>` +
  `<path d="M30 11Q34 20 30 29" stroke="${fin}" stroke-width="3" fill="none" opacity=".7"/><circle cx="45" cy="18" r="3" fill="#0b2e3f"/><circle cx="46" cy="17" r="1" fill="#fff"/>`;

function oceanGround(): string {
  const coral = (x: number, y: number, c: string, s = 1) =>
    `<path d="M${x} ${y}c0-${40 * s}-${10 * s}-${60 * s}-${30 * s}-${80 * s}M${x} ${y - 30 * s}c${15 * s}-${20 * s} ${30 * s}-${30 * s} ${34 * s}-${56 * s}M${x - 8 * s} ${y - 50 * s}c-${12 * s}-${14 * s}-${26 * s}-${14 * s}-${32 * s}-${30 * s}M${x + 20 * s} ${y - 58 * s}c${10 * s}-${6 * s} ${16 * s}-${16 * s} ${18 * s}-${28 * s}" stroke="${c}" stroke-width="${14 * s}" stroke-linecap="round" fill="none"/>`;
  const weed = (x: number, h: number, c: string) =>
    `<path d="M${x} 330c-14-${h * 0.2} 14-${h * 0.4} 0-${h * 0.6}s14-${h * 0.3} 2-${h}" stroke="${c}" stroke-width="11" stroke-linecap="round" fill="none"/>`;
  const star = (x: number, y: number, rot: number) =>
    `<path transform="translate(${x} ${y}) rotate(${rot})" d="M0-16 5-5 17-5 7 3 11 15 0 8-11 15-7 3-17-5-5-5Z" fill="#ff922b" stroke="#e8590c" stroke-width="2" stroke-linejoin="round"/>`;
  const brain = (x: number, y: number) =>
    `<g fill="#b197fc"><circle cx="${x}" cy="${y}" r="30"/><circle cx="${x - 28}" cy="${y + 10}" r="20"/><circle cx="${x + 28}" cy="${y + 10}" r="22"/></g>` +
    `<path d="M${x - 40} ${y + 8}q10-12 20 0t20 0 20 0 20 0M${x - 22} ${y - 10}q10-10 20 0t20 0" stroke="#9775fa" stroke-width="3" fill="none"/>`;
  const fan = (x: number, y: number) =>
    `<path d="M${x} ${y}C${x - 70} ${y - 30} ${x - 60} ${y - 110} ${x} ${y - 120}C${x + 60} ${y - 110} ${x + 70} ${y - 30} ${x} ${y}Z" fill="#ffa94d" opacity=".9"/>` +
    `<path d="M${x} ${y}V${y - 112}M${x} ${y}L${x - 40} ${y - 90}M${x} ${y}L${x + 40} ${y - 90}M${x} ${y}L${x - 56} ${y - 50}M${x} ${y}L${x + 56} ${y - 50}" stroke="#f76707" stroke-width="3"/>`;
  return (
    weed(90, 190, '#63b995') +
    weed(130, 140, '#3fa27a') +
    weed(1480, 210, '#63b995') +
    weed(1520, 150, '#3fa27a') +
    `<path d="M0 300C240 270 420 290 640 300 880 312 1060 280 1280 285 1440 288 1540 300 1600 296V400H0Z" fill="#f2dca6"/>` +
    `<ellipse cx="320" cy="300" rx="64" ry="34" fill="#7fa6b8"/><ellipse cx="300" cy="292" rx="30" ry="12" fill="#9ec0cf"/><ellipse cx="1240" cy="292" rx="52" ry="28" fill="#7fa6b8"/>` +
    coral(220, 318, '#ff8fa3') +
    fan(1360, 310) +
    brain(980, 306) +
    coral(640, 322, '#f783ac', 0.8) +
    weed(760, 170, '#3fa27a') +
    weed(790, 120, '#63b995') +
    `<path d="M0 340C260 322 520 345 800 340 1080 335 1340 320 1600 338V400H0Z" fill="#e8cb8a"/>` +
    star(470, 352, 12) +
    star(1110, 362, -18) +
    `<path d="M884 368c-14 0-22-18-12-30 4 6 8 8 12 8s8-2 12-8c10 12 2 30-12 30z" fill="#ffd8a8" stroke="#f0b37a" stroke-width="2"/>` +
    `<g fill="#d9b779">${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 131) % 1600}" cy="${356 + ((i * 37) % 36)}" r="2.5"/>`).join('')}</g>`
  );
}

const ocean: Scene = {
  ground: oceanGround(),
  sprites: [
    {
      zone: 'sky',
      vb: '0 0 600 600',
      pos: 'top:0;left:2%;width:min(70vw,640px)',
      move: 'amb--pulse',
      dur: 8,
      art: '<g fill="#fff"><path d="M120 0h70L420 600H300Z" opacity=".32"/><path d="M250 0h40L560 560H470Z" opacity=".22"/><path d="M20 0h45L170 600H90Z" opacity=".2"/></g>',
    },
    {
      zone: 'sky',
      vb: '0 0 60 80',
      pos: 'top:14%;right:1.5%;width:52px',
      wide: true,
      move: 'amb--bob',
      dur: 5,
      art:
        '<path d="M8 66q-6 6 0 12M20 66q6 6 0 14M32 66q-6 6 0 12M44 66q6 6 0 12M52 66q-5 5 0 10" stroke="#f783ac" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M4 38C4 16 18 4 30 4S56 16 56 38Q51 44 45 39 40 45 35 39 30 45 25 39 20 45 15 39 10 44 4 38Z" fill="#f783ac"/>' +
        '<path d="M12 22Q18 10 30 9" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5"/><g fill="#ffdeeb" opacity=".8"><circle cx="22" cy="28" r="3"/><circle cx="38" cy="22" r="2.5"/><circle cx="42" cy="32" r="2"/></g>',
    },
    ...[
      [9, 14, -3, 18],
      [27, 22, -11, 12],
      [56, 18, -7, 16],
      [78, 26, -16, 10],
      [93, 20, -1, 14],
    ].map(
      ([left, dur, delay, w]): Sprite => ({
        zone: 'sky',
        vb: '0 0 20 20',
        pos: `left:${left}%;bottom:-30px;width:${w}px`,
        move: 'amb--rise',
        dur,
        delay,
        art: '<circle cx="10" cy="10" r="8.5" fill="#fff" fill-opacity=".25" stroke="#fff" stroke-width="1.6"/><circle cx="7" cy="7" r="2.2" fill="#fff"/>',
      }),
    ),
    { zone: 'ground', vb: '0 0 60 40', pos: 'left:0;bottom:17%;width:56px', move: 'amb--cross', dur: 38, delay: -8, inner: 'amb--bob', dur2: 2.2, art: fish('#ffa94d', '#ff922b') },
    { zone: 'ground', vb: '0 0 60 40', pos: 'left:0;bottom:26%;width:40px', move: 'amb--cross amb--rev', dur: 52, delay: -30, inner: 'amb--bob', dur2: 1.8, art: mirror(60, fish('#ffd43b', '#fab005')) },
    { zone: 'ground', vb: '0 0 60 40', pos: 'left:0;bottom:8%;width:66px', move: 'amb--cross', dur: 64, delay: -44, inner: 'amb--bob', dur2: 2.6, art: fish('#4dabf7', '#228be6') },
  ],
};

// ───────────────────────── Forest: pines, mushrooms, falling leaves, fireflies ─────────────────────────

function pine(x: number, b: number, h: number, c: string, trunk = true): string {
  const f = (n: number) => (n * h).toFixed(1);
  return (
    (trunk ? `<rect x="${x - h * 0.05}" y="${b - h * 0.04}" width="${f(0.1)}" height="${f(0.14)}" fill="#7a5230"/>` : '') +
    `<path d="M${x} ${b - h}l${f(0.28)} ${f(0.42)}h-${f(0.12)}l${f(0.22)} ${f(0.33)}h-${f(0.14)}l${f(0.24)} ${f(0.25)}h-${f(0.96)}l${f(0.24)}-${f(0.25)}h-${f(0.14)}l${f(0.22)}-${f(0.33)}h-${f(0.12)}z" fill="${c}"/>`
  );
}

function forestGround(): string {
  const r = rng(3);
  let back = '';
  for (let x = -20; x < 1640; x += 62) back += pine(x + r() * 20, 272 + r() * 8, 110 + r() * 50, r() > 0.5 ? '#c7dcb0' : '#bcd4a2', false);
  let mid = '';
  for (const [x, h] of [
    [80, 230],
    [190, 190],
    [300, 250],
    [1300, 240],
    [1410, 200],
    [1530, 260],
  ] as const)
    mid += pine(x, 330, h, '#6fa863');
  let front = '';
  for (const [x, h] of [
    [30, 280],
    [140, 220],
    [1470, 230],
    [1580, 290],
  ] as const)
    front += pine(x, 380, h, '#3f7a43');
  const mushroom = (x: number, y: number, s: number) =>
    `<rect x="${x - 7 * s}" y="${y - 20 * s}" width="${14 * s}" height="${22 * s}" rx="${6 * s}" fill="#fff4e6"/>` +
    `<path d="M${x - 24 * s} ${y - 18 * s}a${24 * s} ${20 * s} 0 0 1 ${48 * s} 0z" fill="#e8590c"/>` +
    `<circle cx="${x - 10 * s}" cy="${y - 28 * s}" r="${4 * s}" fill="#fff"/><circle cx="${x + 8 * s}" cy="${y - 31 * s}" r="${3.5 * s}" fill="#fff"/><circle cx="${x + 16 * s}" cy="${y - 22 * s}" r="${2.5 * s}" fill="#fff"/>`;
  const bush = (x: number, y: number) =>
    `<g fill="#5d9a4f"><circle cx="${x}" cy="${y}" r="30"/><circle cx="${x + 34}" cy="${y + 6}" r="24"/><circle cx="${x - 30}" cy="${y + 8}" r="22"/></g><g fill="#78b465"><circle cx="${x - 6}" cy="${y - 10}" r="12"/></g>`;
  return (
    back +
    `<path d="M0 280C300 262 600 286 900 276 1200 266 1400 284 1600 272V400H0Z" fill="#a9cd8a"/>` +
    mid +
    `<path d="M0 330C260 318 520 336 800 330 1080 324 1340 318 1600 332V400H0Z" fill="#8fbf6a"/>` +
    bush(560, 336) +
    bush(1080, 340) +
    // a hollow log with a little door: the fox's den
    `<g transform="translate(760 300)"><rect x="0" y="0" width="150" height="62" rx="31" fill="#9c6b3c"/><ellipse cx="150" cy="31" rx="20" ry="31" fill="#c08552"/><ellipse cx="150" cy="31" rx="11" ry="19" fill="#7a5230"/>` +
    `<path d="M40 62V40a16 16 0 0 1 32 0v22z" fill="#5c3b20"/><circle cx="66" cy="50" r="2.5" fill="#fcc419"/><path d="M20 12h60M92 22h30" stroke="#7a5230" stroke-width="4" stroke-linecap="round"/></g>` +
    front +
    `<path d="M0 372C300 360 600 380 900 372 1200 364 1400 378 1600 368V400H0Z" fill="#78ad57"/>` +
    mushroom(470, 380, 1) +
    mushroom(505, 384, 0.6) +
    mushroom(1190, 378, 0.9) +
    `<g stroke="#5b8f3f" stroke-width="3" stroke-linecap="round">${Array.from({ length: 40 }, (_, i) => {
      const x = (i * 97) % 1600;
      return `<path d="M${x} 396l-4-12M${x + 5} 396l2-14M${x + 10} 396l5-10"/>`;
    }).join('')}</g>`
  );
}

const leaf = (c: string) =>
  `<path d="M12 2C21 8 23 19 12 30 1 19 3 8 12 2Z" fill="${c}"/><path d="M12 6V27" stroke="rgba(0,0,0,.2)" stroke-width="1.5"/>`;

const forest: Scene = {
  ground: forestGround(),
  sprites: [
    {
      zone: 'sky',
      vb: '0 0 200 200',
      pos: 'top:-60px;right:-50px;width:min(40vw,260px)',
      art: '<circle cx="100" cy="100" r="90" fill="#fff6d1" opacity=".7"/><circle cx="100" cy="100" r="58" fill="#ffec99" opacity=".9"/>',
    },
    {
      zone: 'sky',
      vb: '0 0 300 120',
      pos: 'top:0;left:0;width:min(46vw,300px)',
      art:
        '<path d="M0 10C60 40 120 46 190 30S280 6 300 0" stroke="#7a5230" stroke-width="4" fill="none"/>' +
        [
          [30, 26, 160, '#69a85a'],
          [70, 38, 200, '#82bd6c'],
          [112, 42, 150, '#5d9a4f'],
          [150, 38, 210, '#82bd6c'],
          [192, 30, 160, '#69a85a'],
          [236, 18, 200, '#5d9a4f'],
        ]
          .map(([x, y, rot, c]) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(1.1)">${leaf(c as string)}</g>`)
          .join(''),
    },
    ...[
      [12, 19, -4, '#ffa94d', 22],
      [38, 24, -14, '#94d82d', 18],
      [64, 21, -9, '#fab005', 24],
      [86, 27, -19, '#69db7c', 20],
    ].map(
      ([left, dur, delay, c, w]): Sprite => ({
        zone: 'sky',
        vb: '0 0 24 32',
        pos: `left:${left}%;top:-40px;width:${w}px`,
        move: 'amb--fall',
        dur: dur as number,
        delay: delay as number,
        art: leaf(c as string),
      }),
    ),
    ...[
      [20, 12, -1],
      [33, 22, -3],
      [48, 9, -2],
      [62, 18, -5],
      [74, 25, -4],
      [88, 14, -6],
    ].map(
      ([left, bottom, delay]): Sprite => ({
        zone: 'ground',
        vb: '0 0 20 20',
        pos: `left:${left}%;bottom:${bottom}%;width:16px`,
        move: 'amb--wander',
        dur: 11,
        delay,
        inner: 'amb--glow',
        dur2: 2.4,
        art: '<circle cx="10" cy="10" r="9" fill="#fff3bf" opacity=".55"/><circle cx="10" cy="10" r="3.5" fill="#ffe066"/>',
      }),
    ),
  ],
};

// ───────────────────────── Candy: frosting hills, lollipops, candy canes, a castle ─────────────────────────

function candyGround(): string {
  const lolly = (x: number, y: number, s: number, a: string, b: string) =>
    `<rect x="${x - 4 * s}" y="${y}" width="${8 * s}" height="${110 * s}" rx="${4 * s}" fill="#fff" stroke="#f0bcd6" stroke-width="2"/>` +
    `<circle cx="${x}" cy="${y}" r="${38 * s}" fill="${a}"/>` +
    `<path d="M${x} ${y}m0-${6 * s}a${6 * s} ${6 * s} 0 1 1 -${6 * s} ${6 * s}a${12 * s} ${12 * s} 0 1 1 ${12 * s} ${12 * s}a${18 * s} ${18 * s} 0 1 1 -${18 * s} -${18 * s}a${26 * s} ${26 * s} 0 1 1 ${26 * s} ${26 * s}" stroke="${b}" stroke-width="${7 * s}" fill="none" stroke-linecap="round"/>`;
  const cane = (x: number, y: number) => {
    const d = `M${x} ${y + 120}V${y + 24}a22 22 0 0 1 44 0v10`;
    return `<path d="${d}" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#ff6b6b" stroke-width="16" fill="none" stroke-dasharray="11 11"/>`;
  };
  const drop = (x: number, y: number, c: string) =>
    `<path d="M${x - 24} ${y}c0-34 10-46 24-46s24 12 24 46z" fill="${c}"/><ellipse cx="${x - 8}" cy="${y - 30}" rx="5" ry="9" fill="#fff" opacity=".45" transform="rotate(20 ${x - 8} ${y - 30})"/>`;
  const drips = (y: number, fill: string) => {
    let d = `M0 ${y}`;
    for (let x = 0; x < 1600; x += 80) d += `h40q8 0 8 14v${10 + ((x / 80) % 3) * 8}a8 8 0 0 0 16 0v-24q0-4 16-4`;
    return `<path d="${d}V${y - 30}H0Z" fill="${fill}"/>`;
  };
  return (
    `<path d="M0 250C200 196 400 206 600 240 800 274 1000 200 1200 196 1400 192 1500 222 1600 214V400H0Z" fill="#fcc2d7"/>` +
    // the castle on the far hill
    `<g transform="translate(1080 108)"><rect x="20" y="40" width="100" height="70" fill="#fff0f6"/><rect x="0" y="22" width="30" height="88" fill="#ffdeeb"/><rect x="110" y="22" width="30" height="88" fill="#ffdeeb"/>` +
    `<path d="M-4 24 15-14 34 24ZM106 24 125-14 144 24Z" fill="#c2255c"/><path d="M46 42 70 6 94 42Z" fill="#e64980"/><path d="M70 6V-14l14 6-14 6" stroke="#c2255c" stroke-width="3" fill="#ffd43b"/>` +
    `<path d="M56 110V84a14 14 0 0 1 28 0v26z" fill="#c2255c"/><circle cx="15" cy="50" r="6" fill="#74c0fc"/><circle cx="125" cy="50" r="6" fill="#74c0fc"/></g>` +
    `<path d="M0 296C220 258 420 266 620 292 820 318 1020 268 1240 262 1420 258 1520 284 1600 280V400H0Z" fill="#b2f2bb"/>` +
    lolly(170, 210, 1, '#ff8fab', '#fff') +
    lolly(1450, 226, 0.8, '#b197fc', '#fff') +
    cane(330, 222) +
    cane(1250, 238) +
    drips(330, '#fff') +
    `<path d="M0 344C260 330 520 350 800 344 1080 338 1340 330 1600 342V400H0Z" fill="#ffa8c5"/>` +
    `<path d="M0 352C260 338 520 358 800 352 1080 346 1340 338 1600 350" stroke="#fff" stroke-width="6" fill="none" opacity=".7"/>` +
    drop(560, 360, '#74c0fc') +
    drop(640, 366, '#ffd43b') +
    drop(980, 362, '#8ce99a') +
    drop(1060, 368, '#ff8fab') +
    `<g>${Array.from({ length: 50 }, (_, i) => {
      const x = (i * 113) % 1600;
      const y = 362 + ((i * 29) % 34);
      const c = ['#fff', '#ffd43b', '#74c0fc', '#8ce99a', '#b197fc'][i % 5];
      return `<rect x="${x}" y="${y}" width="12" height="4" rx="2" fill="${c}" transform="rotate(${(i * 47) % 180} ${x + 6} ${y + 2})"/>`;
    }).join('')}</g>`
  );
}

const candy: Scene = {
  ground: candyGround(),
  sprites: [
    {
      zone: 'sky',
      vb: '0 0 400 220',
      pos: 'top:-10px;left:-40px;width:min(60vw,420px);opacity:.5',
      art: ['#ff8fab', '#ffc078', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc']
        .map((c, i) => `<path d="M${20 + i * 14} 220A${180 - i * 14} ${180 - i * 14} 0 0 1 ${380 - i * 14} 220" stroke="${c}" stroke-width="14" fill="none"/>`)
        .join(''),
    },
    { zone: 'sky', vb: '0 0 110 62', pos: 'top:12%;left:0;width:150px', move: 'amb--cross', dur: 160, delay: -50, art: cloud('#ffe3ef', '#fcc2d7') },
    { zone: 'sky', vb: '0 0 110 62', pos: 'top:28%;left:0;width:120px', move: 'amb--cross', dur: 210, delay: -150, art: cloud('#f3f0ff', '#e5dbff') },
    ...[
      ['top:8%;left:38%', '#ff8fab', 3.2, -1],
      ['top:20%;right:24%', '#b197fc', 4, -2],
      ['top:34%;left:12%', '#ffd43b', 3.6, -0.5],
      ['top:42%;right:8%', '#74c0fc', 4.4, -3],
      ['top:5%;right:40%', '#8ce99a', 3, -1.5],
    ].map(
      ([pos, c, dur, delay]): Sprite => ({
        zone: 'sky',
        vb: '0 0 20 20',
        pos: `${pos};width:18px`,
        move: 'amb--twinkle',
        dur: dur as number,
        delay: delay as number,
        art: sparkle(c as string),
      }),
    ),
    ...[
      ['left:6%;bottom:22%', '#ff8fab', -1],
      ['right:7%;bottom:28%', '#74c0fc', -2.5],
    ].map(
      ([pos, c, delay]): Sprite => ({
        zone: 'ground',
        vb: '0 0 56 28',
        pos: `${pos};width:48px`,
        move: 'amb--bob',
        dur: 3.6,
        delay: delay as number,
        art: `<path d="M14 14 2 4v20zM42 14l12-10v20z" fill="#ffd43b"/><circle cx="28" cy="14" r="13" fill="${c}"/><path d="M20 8q8 8 0 14M28 4q8 10 0 20M36 8q-6 8 0 14" stroke="#fff" stroke-width="2.5" fill="none" opacity=".75"/>`,
      }),
    ),
  ],
};

// ───────────────────────── Space: moon surface, ringed planet, stars, a rover ─────────────────────────

function starField(): string {
  const r = rng(11);
  let out = '';
  for (let i = 0; i < 90; i++) {
    const big = r() > 0.85;
    out += `<circle cx="${(r() * 1600).toFixed(0)}" cy="${(r() * 700).toFixed(0)}" r="${big ? 2.2 : 1.2}" fill="#fff" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`;
  }
  return out;
}

function spaceGround(): string {
  const crater = (x: number, y: number, rx: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.32}" fill="#2f3466"/><path d="M${x - rx} ${y}a${rx} ${rx * 0.32} 0 0 0 ${rx * 2} 0" stroke="#6a71b5" stroke-width="3" fill="none"/>`;
  return (
    // Earth rising on the horizon
    `<g transform="translate(250 262)"><circle r="58" fill="#4dabf7"/><path d="M-40-30c14-8 30 0 26 14s-22 12-20 26-16 10-24-2c-6-12 4-30 18-38zM10 10c14-6 34 4 30 18s-26 26-36 12 0-24 6-30z" fill="#69db7c"/><path d="M-50-10a60 60 0 0 0 10 46" stroke="#fff" stroke-width="5" fill="none" opacity=".35"/></g>` +
    `<path d="M0 300C200 285 400 300 600 296 850 290 1050 270 1300 284 1450 292 1540 300 1600 296V400H0Z" fill="#3b4178"/>` +
    // moon base
    `<g transform="translate(860 230)"><path d="M0 68a60 60 0 0 1 120 0z" fill="#a5b4fc" opacity=".45"/><path d="M0 68a60 60 0 0 1 120 0" stroke="#c7d2fe" stroke-width="4" fill="none"/>` +
    `<path d="M30 30q30-26 60 0" stroke="#fff" stroke-width="4" fill="none" opacity=".45"/><rect x="-14" y="62" width="148" height="12" rx="6" fill="#5c64a8"/>` +
    `<path d="M150 74V20" stroke="#c7d2fe" stroke-width="4"/><path d="M134 20q16-20 32 0z" fill="#c7d2fe"/><circle cx="150" cy="10" r="5" fill="#ff8787"/></g>` +
    crater(420, 330, 50) +
    crater(1200, 318, 36) +
    `<path d="M0 346C260 334 520 352 800 346 1080 340 1340 334 1600 344V400H0Z" fill="#4b5293"/>` +
    crater(640, 372, 30) +
    crater(1430, 370, 44) +
    crater(130, 376, 26) +
    `<g fill="#5c64a8">${Array.from({ length: 24 }, (_, i) => `<ellipse cx="${(i * 149) % 1600}" cy="${360 + ((i * 23) % 32)}" rx="${6 + (i % 4) * 3}" ry="4"/>`).join('')}</g>`
  );
}

const space: Scene = {
  ground: spaceGround(),
  sprites: [
    { zone: 'sky', vb: '0 0 1600 1000', pos: 'inset:0;width:100%;height:100%', art: starField() },
    {
      zone: 'sky',
      vb: '0 0 600 400',
      pos: 'top:-40px;left:-60px;width:min(80vw,640px);opacity:.9',
      art:
        '<defs><radialGradient id="nb1"><stop offset="0" stop-color="#7048e8" stop-opacity=".45"/><stop offset="1" stop-color="#7048e8" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="nb2"><stop offset="0" stop-color="#15aabf" stop-opacity=".35"/><stop offset="1" stop-color="#15aabf" stop-opacity="0"/></radialGradient></defs>' +
        '<ellipse cx="220" cy="150" rx="220" ry="130" fill="url(#nb1)"/><ellipse cx="380" cy="110" rx="180" ry="100" fill="url(#nb2)"/>',
    },
    {
      zone: 'sky',
      vb: '0 0 220 160',
      pos: 'top:5%;right:-20px;width:min(36vw,230px)',
      move: 'amb--bob',
      dur: 7,
      art:
        '<ellipse cx="110" cy="84" rx="104" ry="24" fill="none" stroke="#ffd8a8" stroke-width="8" opacity=".85" transform="rotate(-14 110 84)"/>' +
        '<circle cx="110" cy="80" r="52" fill="#f4a259"/><path d="M62 64q48 14 96-4M58 86q52 16 104-2M70 108q40 10 80-2" stroke="#e07b39" stroke-width="7" fill="none" opacity=".75"/>' +
        '<path d="M80 46a50 50 0 0 1 30-16" stroke="#fff" stroke-width="5" fill="none" opacity=".35" stroke-linecap="round"/>' +
        '<path d="M9 109A104 24 -14 0 0 211 59" fill="none" stroke="#ffd8a8" stroke-width="8"/>' +
        '<circle cx="24" cy="30" r="10" fill="#cfd4ff"/><circle cx="21" cy="27" r="3" fill="#a5b4fc"/>',
    },
    ...[
      ['top:12%;left:30%', 3, -1],
      ['top:30%;left:8%', 4, -2],
      ['top:22%;right:30%', 3.5, -0.5],
      ['top:44%;right:12%', 5, -3],
      ['top:52%;left:22%', 4.5, -1.5],
      ['top:8%;left:58%', 3.8, -2.6],
    ].map(
      ([pos, dur, delay]): Sprite => ({
        zone: 'sky',
        vb: '0 0 20 20',
        pos: `${pos};width:14px`,
        move: 'amb--twinkle',
        dur: dur as number,
        delay: delay as number,
        art: sparkle('#fff'),
      }),
    ),
    {
      zone: 'sky',
      vb: '0 0 120 40',
      pos: 'top:10%;right:12%;width:120px',
      move: 'amb--shoot',
      dur: 13,
      delay: -6,
      art: '<path d="M14 34 116 4" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".6"/><circle cx="11" cy="35" r="4" fill="#fff"/>',
    },
    {
      zone: 'ground',
      vb: '0 0 70 44',
      pos: 'left:0;bottom:7%;width:64px',
      move: 'amb--cross',
      dur: 80,
      delay: -25,
      art:
        '<path d="M50 14V2" stroke="#adb5bd" stroke-width="2.5"/><circle cx="50" cy="3" r="3" fill="#ff8787"/><rect x="10" y="12" width="50" height="18" rx="6" fill="#dee2e6"/>' +
        '<rect x="16" y="16" width="16" height="8" rx="3" fill="#74c0fc"/><rect x="6" y="28" width="58" height="6" rx="3" fill="#868e96"/>' +
        '<g fill="#495057"><circle cx="16" cy="36" r="7"/><circle cx="35" cy="36" r="7"/><circle cx="54" cy="36" r="7"/></g><g fill="#adb5bd"><circle cx="16" cy="36" r="2.5"/><circle cx="35" cy="36" r="2.5"/><circle cx="54" cy="36" r="2.5"/></g>',
    },
  ],
};

// ───────────────────────── Studio: quiet geometry and sound waves ─────────────────────────

function studioGround(): string {
  // One smooth "track" waveform: thin bars under a gentle envelope, a few in the accent blue.
  let bars = '';
  for (let i = 0; i < 160; i++) {
    const env = (0.55 + 0.45 * Math.sin(i * 0.09)) * (0.6 + 0.4 * Math.sin(i * 0.31 + 1));
    const h = 10 + env * 70;
    bars += `<rect x="${i * 10 + 2}" y="${360 - h}" width="5" height="${(h * 2).toFixed(1)}" rx="2.5" fill="${i % 11 === 5 ? '#bfdbfe' : '#e4e4e7'}"/>`;
  }
  return `<rect x="0" y="358" width="1600" height="4" fill="#d4d4d8"/>` + bars;
}

const studio: Scene = {
  ground: studioGround(),
  sprites: [
    {
      zone: 'sky',
      vb: '0 0 300 300',
      pos: 'top:-90px;right:-90px;width:min(52vw,360px)',
      art:
        [140, 118, 96, 74, 52].map((r, i) => `<circle cx="150" cy="150" r="${r}" fill="none" stroke="${i === 2 ? '#bfdbfe' : '#e4e4e7'}" stroke-width="${i === 2 ? 3 : 2}"/>`).join('') +
        '<circle cx="150" cy="150" r="22" fill="#e4e4e7"/><circle cx="150" cy="150" r="5" fill="#a1a1aa"/>',
    },
    ...[
      ['top:24%;left:6%', '<circle cx="20" cy="20" r="15" fill="none" stroke="#c4c4cc" stroke-width="3"/>', 11, -3],
      ['top:40%;right:7%', '<path d="M20 5 36 33H4Z" fill="none" stroke="#93c5fd" stroke-width="3" stroke-linejoin="round"/>', 13, -6],
      ['top:12%;left:40%', '<path d="M20 8v24M8 20h24" stroke="#d4d4d8" stroke-width="3" stroke-linecap="round"/>', 9, -2],
      ['top:56%;left:4%', '<rect x="8" y="8" width="24" height="24" rx="4" fill="none" stroke="#d4d4d8" stroke-width="3" transform="rotate(20 20 20)"/>', 12, -8],
    ].map(
      ([pos, art, dur, delay]): Sprite => ({
        zone: 'sky',
        vb: '0 0 40 40',
        pos: `${pos};width:30px`,
        move: 'amb--bob',
        dur: dur as number,
        delay: delay as number,
        art: art as string,
      }),
    ),
    {
      // A slow playhead gliding along the track.
      zone: 'ground',
      vb: '0 0 20 200',
      pos: 'left:0;bottom:0;width:20px;height:min(26vh,230px)',
      move: 'amb--cross',
      dur: 48,
      delay: -14,
      art: '<rect x="8.5" y="14" width="3" height="186" rx="1.5" fill="#3b82f6" opacity=".55"/><circle cx="10" cy="10" r="8" fill="#3b82f6" opacity=".8"/>',
    },
  ],
};

export const SCENES: Record<string, Scene> = { sunny, ocean, forest, candy, space, studio };

export function sceneFor(themeId: string): Scene {
  return SCENES[themeId] ?? sunny;
}
