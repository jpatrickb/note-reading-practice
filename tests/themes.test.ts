import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/core/storage';
import {
  CONTRAST_CHECKS,
  DEFAULT_THEME,
  THEMES,
  type Theme,
  checkTheme,
  contrast,
  cssVarName,
  deltaE,
  getTheme,
  isThemeId,
  luminance,
  parseHex,
  themeVars,
} from '../src/core/themes';

describe('color math', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
    // Well-known reference value: #767676 on white is the lightest gray that passes AA (4.54:1).
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('parses short and long hex, and rejects anything else', () => {
    expect(parseHex('#fa0')).toEqual([255, 170, 0]);
    expect(parseHex('#FFAA00')).toEqual([255, 170, 0]);
    expect(() => parseHex('red')).toThrow(/Not a hex color/);
    expect(() => parseHex('#12345')).toThrow();
  });

  it('measures color difference (CIE76)', () => {
    expect(deltaE('#ffffff', '#ffffff')).toBe(0);
    expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 0);
    expect(deltaE('#adb5bd', '#f59f00')).toBeGreaterThan(40); // silver vs gold: same lightness, clearly different
  });
});

describe('themes', () => {
  it('has a handful of uniquely named themes, Sunny first as the default', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
    expect(THEMES[0].id).toBe('sunny');
    expect(DEFAULT_THEME).toBe('sunny');
    expect(THEMES.some((t) => t.dark)).toBe(true);
  });

  it('uses valid hex colors and system fonts only', () => {
    for (const t of THEMES as readonly Theme[]) {
      for (const [token, color] of Object.entries(t.colors)) expect(() => parseHex(color), `${t.id}.${token}`).not.toThrow();
      expect(t.font, t.id).toMatch(/system-ui|sans-serif/);
      expect(t.backdrop, t.id).not.toMatch(/url\(/); // patterns are CSS gradients, not downloads
    }
  });

  // The readability gate: every theme must pass every rule. Add a theme → it gets checked here.
  describe.each(THEMES.map((t) => [t.name, t] as const))('%s is readable', (_name, theme) => {
    it.each(CONTRAST_CHECKS.map((c) => [`${c.fg} on ${c.bg} (${c.where})`, c] as const))('%s', (_label, check) => {
      const result = checkTheme(theme).find((r) => r.fg === check.fg && r.bg === check.bg && r.kind === check.kind)!;
      expect(result.value, `${theme.id}: ${result.fg} ${theme.colors[result.fg]} on ${result.bg} ${theme.colors[result.bg]}`).toBeGreaterThanOrEqual(result.min);
    });
  });

  it('flags a theme that breaks the rules', () => {
    const bad: Theme = { ...THEMES[0], id: 'bad', colors: { ...THEMES[0].colors, ink: '#cccccc', silver2: '#f59f00' } };
    const failures = checkTheme(bad).filter((r) => !r.ok);
    expect(failures.map((f) => `${f.fg}/${f.bg}`)).toEqual(expect.arrayContaining(['ink/bg', 'ink/card', 'silver2/gold2']));
    expect(checkTheme(THEMES[0]).every((r) => r.ok)).toBe(true);
  });

  it('falls back to the default for unknown ids', () => {
    expect(getTheme('space').id).toBe('space');
    expect(getTheme('glitter').id).toBe('sunny');
    expect(getTheme(undefined).id).toBe('sunny');
    expect(isThemeId('ocean')).toBe(true);
    expect(isThemeId('nope')).toBe(false);
    expect(isThemeId(3)).toBe(false);
  });

  it('turns tokens into CSS custom properties', () => {
    expect(cssVarName('primaryInk')).toBe('--primary-ink');
    expect(cssVarName('gold1')).toBe('--gold-1');
    const vars = themeVars(getTheme('space'));
    expect(vars['--bg']).toBe('#0f1226');
    expect(vars['--key-white']).toBe('#e8ebf8');
    expect(vars['--mascot']).toBe('"🚀"');
    expect(Object.keys(vars)).toEqual(expect.arrayContaining(['--font', '--radius', '--shadow', '--backdrop']));
  });

  it('every token is used by the stylesheet, and its :root defaults match Sunny', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    const root = /:root\s*\{([^}]*)\}/.exec(css)![1]!;
    const declared = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
    expect(declared).toEqual(themeVars(getTheme('sunny')));
    const users = css + THEMES.map((t) => t.backdrop).join(); // --pattern is used by the backdrops
    for (const name of Object.keys(declared)) expect(users, name).toContain(`var(${name})`);
  });
});

describe('theme setting', () => {
  const memoryStore = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  };

  it('persists the chosen theme and drops unknown ones', () => {
    const store = memoryStore();
    expect(loadSettings(store).theme).toBeUndefined();
    saveSettings(store, { ...DEFAULT_SETTINGS, theme: 'forest' });
    expect(loadSettings(store).theme).toBe('forest');
    store.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['bass'], muted: false, theme: 'retired-theme' }));
    expect(loadSettings(store)).toEqual({ clefs: ['bass'], muted: false });
  });
});
