// Kid-selectable visual themes (decision D17). Pure data + color math, no DOM: the UI applies a
// theme's tokens as CSS custom properties (src/ui/theme.ts), and tests/themes.test.ts checks every
// theme against CONTRAST_CHECKS, so a new theme can't ship hard to read.

export interface ThemeColors {
  /** Page background (also the browser `theme-color`). */
  bg: string;
  /** Cards, the staff, answer keys, toasts. */
  card: string;
  ink: string;
  muted: string;
  /** Staff lines, ledger lines, clefs. */
  line: string;
  primary: string;
  primaryInk: string;
  /** Secondary buttons, segmented control, progress track. */
  secondary: string;
  right: string;
  rightInk: string;
  wrong: string;
  wrongInk: string;
  /** "?" reveals and the keyboard focus ring. */
  reveal: string;
  /** The "learning" bar on a mastery key. */
  meter: string;
  gold1: string;
  gold2: string;
  silver1: string;
  silver2: string;
  locked: string;
  /** Text on gold/silver badges and toasts. */
  medalInk: string;
  keyWhite: string;
  keyBorder: string;
  keyBlack: string;
  keyInk: string;
  /** The middle-C dot on the mastery keyboard. */
  keyDot: string;
  /** Background of the home-screen tip. */
  tip: string;
  /** Background of mini-lessons. */
  lesson: string;
  /** Thin borders: text fields, table rules. */
  rule: string;
  /** Color of the subtle background pattern (if the theme has one). */
  pattern: string;
}

export interface Theme {
  id: string;
  name: string;
  /** Shown in the picker and before the home-screen title. */
  mascot: string;
  blurb: string;
  dark: boolean;
  /** System font stacks only: no web font downloads. */
  font: string;
  radius: string;
  shadow: string;
  /** CSS background-image for the page; use `var(--pattern)` for its color. */
  backdrop: string;
  colors: ThemeColors;
}

const ROUNDED = "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif";
const SOFT_SHADOW = '0 2px 0 rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.06)';
const dots = (size: number, gap: number) =>
  `radial-gradient(circle, var(--pattern) ${size}px, transparent ${size + 1}px) 0 0 / ${gap}px ${gap}px, ` +
  `radial-gradient(circle, var(--pattern) ${size}px, transparent ${size + 1}px) ${gap / 2}px ${gap / 2}px / ${gap}px ${gap}px`;

export const THEMES = [
  {
    id: 'sunny',
    name: 'Sunny',
    mascot: '🎵',
    blurb: 'Warm and bright',
    dark: false,
    font: ROUNDED,
    radius: '18px',
    shadow: SOFT_SHADOW,
    backdrop: 'none',
    colors: {
      bg: '#fff8ec',
      card: '#ffffff',
      ink: '#2b2a33',
      muted: '#635f70',
      line: '#2b2a33',
      primary: '#c4410c',
      primaryInk: '#ffffff',
      secondary: '#f1ebe0',
      right: '#2b8a3e',
      rightInk: '#ffffff',
      wrong: '#d42a2a',
      wrongInk: '#ffffff',
      reveal: '#1c7ed6',
      meter: '#3d97e8',
      gold1: '#ffe066',
      gold2: '#f59f00',
      silver1: '#f1f3f5',
      silver2: '#adb5bd',
      locked: '#e2dccf',
      medalInk: '#2b2a33',
      keyWhite: '#ffffff',
      keyBorder: '#cfc8bb',
      keyBlack: '#3b3a42',
      keyInk: '#2b2a33',
      keyDot: '#c4410c',
      tip: '#e7f5ff',
      lesson: '#fff9db',
      rule: '#ddd5c6',
      pattern: '#fff8ec',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    mascot: '🐳',
    blurb: 'Cool blues and bubbles',
    dark: false,
    font: ROUNDED,
    radius: '22px',
    shadow: '0 2px 0 rgb(11 46 63 / 0.06), 0 8px 24px rgb(11 46 63 / 0.08)',
    backdrop: dots(3, 44),
    colors: {
      bg: '#e8f5fa',
      card: '#ffffff',
      ink: '#0b2e3f',
      muted: '#44606e',
      line: '#0b2e3f',
      primary: '#0b7285',
      primaryInk: '#ffffff',
      secondary: '#d2eaf2',
      right: '#2b8a3e',
      rightInk: '#ffffff',
      wrong: '#c92a2a',
      wrongInk: '#ffffff',
      reveal: '#1864ab',
      meter: '#1098ad',
      gold1: '#ffe58f',
      gold2: '#f59f00',
      silver1: '#eef2f5',
      silver2: '#a3b3bf',
      locked: '#d3e2e8',
      medalInk: '#0b2e3f',
      keyWhite: '#ffffff',
      keyBorder: '#b5cdd8',
      keyBlack: '#163447',
      keyInk: '#0b2e3f',
      keyDot: '#d9480f',
      tip: '#d0f0f7',
      lesson: '#fff6d6',
      rule: '#bed6e0',
      pattern: '#d5ecf5',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    mascot: '🦊',
    blurb: 'Leafy greens and woods',
    dark: false,
    font: "'Avenir Next', Avenir, 'Segoe UI', system-ui, -apple-system, sans-serif",
    radius: '14px',
    shadow: '0 2px 0 rgb(31 45 28 / 0.08), 0 8px 20px rgb(31 45 28 / 0.08)',
    backdrop: 'repeating-linear-gradient(135deg, var(--pattern) 0 2px, transparent 2px 26px)',
    colors: {
      bg: '#f0f4e8',
      card: '#fffef8',
      ink: '#1f2d1c',
      muted: '#52614c',
      line: '#1f2d1c',
      primary: '#2f6b2f',
      primaryInk: '#ffffff',
      secondary: '#dfe8d0',
      right: '#237032',
      rightInk: '#ffffff',
      wrong: '#c0392b',
      wrongInk: '#ffffff',
      reveal: '#1b64b0',
      meter: '#5c940d',
      gold1: '#ffe08a',
      gold2: '#e8a10c',
      silver1: '#f1f3ee',
      silver2: '#a8b1a3',
      locked: '#dcdccb',
      medalInk: '#1f2d1c',
      keyWhite: '#fffef8',
      keyBorder: '#c3c8b2',
      keyBlack: '#3a3226',
      keyInk: '#1f2d1c',
      keyDot: '#b3530f',
      tip: '#e3f1d5',
      lesson: '#fbf2cf',
      rule: '#cdd5bf',
      pattern: '#e6ecda',
    },
  },
  {
    id: 'candy',
    name: 'Candy',
    mascot: '🦄',
    blurb: 'Soft pastels and sprinkles',
    dark: false,
    font: ROUNDED,
    radius: '26px',
    shadow: '0 2px 0 rgb(61 31 58 / 0.06), 0 8px 24px rgb(194 37 92 / 0.08)',
    backdrop: dots(4, 40),
    colors: {
      bg: '#fff0f6',
      card: '#ffffff',
      ink: '#3d1f3a',
      muted: '#755070',
      line: '#3d1f3a',
      primary: '#c2255c',
      primaryInk: '#ffffff',
      secondary: '#fbe0ee',
      right: '#2b8a3e',
      rightInk: '#ffffff',
      wrong: '#c92a2a',
      wrongInk: '#ffffff',
      reveal: '#7048e8',
      meter: '#9775fa',
      gold1: '#ffec99',
      gold2: '#fab005',
      silver1: '#f4f2f8',
      silver2: '#b4adc6',
      locked: '#f3dce8',
      medalInk: '#3d1f3a',
      keyWhite: '#ffffff',
      keyBorder: '#e2c6d6',
      keyBlack: '#4a2a45',
      keyInk: '#3d1f3a',
      keyDot: '#c2255c',
      tip: '#f1e6ff',
      lesson: '#fff6cc',
      rule: '#efcfe0',
      pattern: '#fde1ee',
    },
  },
  {
    id: 'space',
    name: 'Space',
    mascot: '🚀',
    blurb: 'Dark sky and bright stars',
    dark: true,
    font: ROUNDED,
    radius: '18px',
    shadow: '0 0 0 1px rgb(255 255 255 / 0.07), 0 8px 24px rgb(0 0 0 / 0.35)',
    backdrop:
      'radial-gradient(circle, var(--pattern) 1px, transparent 2px) 0 0 / 97px 97px, ' +
      'radial-gradient(circle, var(--pattern) 1.5px, transparent 2.5px) 31px 53px / 151px 151px, ' +
      'radial-gradient(circle, var(--pattern) 1px, transparent 2px) 67px 19px / 73px 73px',
    colors: {
      bg: '#0f1226',
      card: '#1c2042',
      ink: '#eef0ff',
      muted: '#aab0d8',
      line: '#d5d9f5',
      primary: '#ffd43b',
      primaryInk: '#1c2042',
      secondary: '#2c3160',
      right: '#69db7c',
      rightInk: '#0f1226',
      wrong: '#ff8787',
      wrongInk: '#0f1226',
      reveal: '#74c0fc',
      meter: '#3b7ddd',
      gold1: '#ffe066',
      gold2: '#fcc419',
      silver1: '#e9ecef',
      silver2: '#9aa6bd',
      locked: '#454b7c',
      medalInk: '#14172e',
      keyWhite: '#e8ebf8',
      keyBorder: '#6a70a0',
      keyBlack: '#0b0d1c',
      keyInk: '#14172e',
      keyDot: '#d9480f',
      tip: '#243063',
      lesson: '#3a3424',
      rule: '#3d4270',
      pattern: '#5d6499',
    },
  },
  {
    id: 'studio',
    name: 'Studio',
    mascot: '🎧',
    blurb: 'Clean and simple',
    dark: false,
    font: "system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    radius: '10px',
    shadow: '0 1px 2px rgb(0 0 0 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.05)',
    backdrop: 'none',
    colors: {
      bg: '#f4f4f5',
      card: '#ffffff',
      ink: '#18181b',
      muted: '#5b5b66',
      line: '#18181b',
      primary: '#18181b',
      primaryInk: '#ffffff',
      secondary: '#e4e4e7',
      right: '#15803d',
      rightInk: '#ffffff',
      wrong: '#b91c1c',
      wrongInk: '#ffffff',
      reveal: '#2563eb',
      meter: '#3b82f6',
      gold1: '#fde68a',
      gold2: '#e0a100',
      silver1: '#f4f4f5',
      silver2: '#a1a1aa',
      locked: '#dcdce0',
      medalInk: '#18181b',
      keyWhite: '#ffffff',
      keyBorder: '#c4c4cc',
      keyBlack: '#27272a',
      keyInk: '#18181b',
      keyDot: '#2563eb',
      tip: '#e0ecff',
      lesson: '#fef6d8',
      rule: '#d4d4d8',
      pattern: '#f4f4f5',
    },
  },
] as const satisfies readonly Theme[];

export type ThemeId = (typeof THEMES)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'sunny';

export function isThemeId(id: unknown): id is ThemeId {
  return THEMES.some((t) => t.id === id);
}

/** The theme with this id, or the default for unknown/missing ids (e.g. a theme that was removed). */
export function getTheme(id: unknown): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** camelCase token → CSS custom property: primaryInk → --primary-ink, gold1 → --gold-1. */
export const cssVarName = (token: string) => `--${token.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)}`;

/** Every CSS custom property a theme sets. */
export function themeVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.colors)) vars[cssVarName(k)] = v;
  vars['--font'] = theme.font;
  vars['--radius'] = theme.radius;
  vars['--shadow'] = theme.shadow;
  vars['--backdrop'] = theme.backdrop;
  vars['--mascot'] = JSON.stringify(theme.mascot);
  return vars;
}

// ───────────────────────── color math (WCAG 2.x, CIELAB) ─────────────────────────

/** Parse #rgb or #rrggbb into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a hex color: ${hex}`);
  const s = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map(linear) as [number, number, number];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 color difference: ~2.3 is just noticeable; 20+ reads as clearly different colors. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ───────────────────────── readability rules for every theme ─────────────────────────

type Token = keyof ThemeColors;
export interface ColorCheck {
  fg: Token;
  bg: Token;
  /**
   * 'text' = WCAG AA 4.5:1. 'large' = large text or UI graphics, 3:1.
   * 'distinct' = clearly different colors, CIE ΔE ≥ 20 (gold and silver differ by hue more than lightness).
   * 'apart' = ΔE ≥ 12, for locked keys, which also have no letter and a dashed outline.
   */
  kind: 'text' | 'large' | 'distinct' | 'apart';
  where: string;
}

export const MIN = { text: 4.5, large: 3, distinct: 20, apart: 12 } as const;

export const CONTRAST_CHECKS: readonly ColorCheck[] = [
  // Body text
  { fg: 'ink', bg: 'bg', kind: 'text', where: 'titles and weekly goal on the page' },
  { fg: 'ink', bg: 'card', kind: 'text', where: 'card text, answer keys, hints, toasts' },
  { fg: 'ink', bg: 'secondary', kind: 'text', where: 'secondary buttons, clef picker' },
  { fg: 'ink', bg: 'tip', kind: 'text', where: 'home-screen tip' },
  { fg: 'ink', bg: 'lesson', kind: 'text', where: 'mini-lessons' },
  { fg: 'muted', bg: 'bg', kind: 'text', where: 'muted text on the page' },
  { fg: 'muted', bg: 'card', kind: 'text', where: 'muted text on cards' },
  { fg: 'primaryInk', bg: 'primary', kind: 'text', where: 'primary buttons' },
  { fg: 'primary', bg: 'tip', kind: 'text', where: 'link button in the tip' },
  { fg: 'primary', bg: 'card', kind: 'text', where: 'link buttons on cards' },
  { fg: 'wrong', bg: 'card', kind: 'text', where: 'warnings' },
  { fg: 'medalInk', bg: 'gold1', kind: 'text', where: 'gold toast / new-note badge' },
  { fg: 'medalInk', bg: 'gold2', kind: 'text', where: 'gold toast (gradient end)' },
  { fg: 'medalInk', bg: 'silver1', kind: 'text', where: 'silver toast' },
  { fg: 'medalInk', bg: 'silver2', kind: 'text', where: 'silver toast (gradient end)' },
  { fg: 'keyInk', bg: 'keyWhite', kind: 'text', where: 'letters on learning keys' },
  { fg: 'keyInk', bg: 'silver2', kind: 'text', where: 'letters on silver keys' },
  { fg: 'keyInk', bg: 'gold2', kind: 'text', where: 'letters on gold keys' },
  // The staff (graphics + large labels)
  { fg: 'ink', bg: 'card', kind: 'large', where: 'note head' },
  { fg: 'line', bg: 'card', kind: 'large', where: 'staff lines, ledger lines, clef' },
  { fg: 'right', bg: 'card', kind: 'large', where: 'correct note + label' },
  { fg: 'wrong', bg: 'card', kind: 'large', where: 'wrong note + label' },
  { fg: 'reveal', bg: 'card', kind: 'large', where: 'revealed note + label; focus ring on cards' },
  { fg: 'reveal', bg: 'bg', kind: 'large', where: 'focus ring on the page' },
  { fg: 'right', bg: 'bg', kind: 'large', where: 'praise check mark' },
  // Answer pad + progress
  { fg: 'rightInk', bg: 'right', kind: 'large', where: 'correct answer key' },
  { fg: 'wrongInk', bg: 'wrong', kind: 'large', where: 'wrong answer key' },
  { fg: 'muted', bg: 'secondary', kind: 'large', where: '"?" key' },
  { fg: 'card', bg: 'reveal', kind: 'large', where: 'check mark on the chosen theme' },
  { fg: 'right', bg: 'secondary', kind: 'large', where: 'progress bar fill' },
  // Mastery keyboard: the four levels must look clearly different from each other
  { fg: 'meter', bg: 'keyWhite', kind: 'large', where: 'learning bar on a key' },
  { fg: 'keyDot', bg: 'keyWhite', kind: 'large', where: 'middle-C dot' },
  { fg: 'keyWhite', bg: 'locked', kind: 'apart', where: 'learning vs locked key' },
  { fg: 'keyWhite', bg: 'silver2', kind: 'distinct', where: 'learning vs silver key' },
  { fg: 'keyWhite', bg: 'gold2', kind: 'distinct', where: 'learning vs gold key' },
  { fg: 'silver2', bg: 'gold2', kind: 'distinct', where: 'silver vs gold key' },
  { fg: 'silver2', bg: 'locked', kind: 'apart', where: 'silver vs locked key' },
  { fg: 'gold2', bg: 'locked', kind: 'distinct', where: 'gold vs locked key; weekly dots' },
];

export interface CheckResult extends ColorCheck {
  value: number;
  min: number;
  ok: boolean;
}

export function checkTheme(theme: Theme): CheckResult[] {
  return CONTRAST_CHECKS.map((c) => {
    const [fg, bg] = [theme.colors[c.fg], theme.colors[c.bg]];
    const value = c.kind === 'distinct' || c.kind === 'apart' ? deltaE(fg, bg) : contrast(fg, bg);
    return { ...c, value, min: MIN[c.kind], ok: value >= MIN[c.kind] };
  });
}
