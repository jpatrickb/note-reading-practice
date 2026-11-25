import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIN, THEMES, contrast, parseHex } from '../src/core/themes';

/** `fg` at `alpha` over `bg`, as #rrggbb. */
function blend(fg: string, bg: string, alpha: number): string {
  const [a, b] = [parseHex(fg), parseHex(bg)];
  return `#${a.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

const CURSOR_ALPHA = 0.16; // .staff-seq__cursor fill-opacity

describe('multi-note staff colors in every theme', () => {
  for (const theme of THEMES) {
    it(`${theme.id}: the reading-cursor tint keeps notes, lines and answer colors readable`, () => {
      const tint = blend(theme.colors.primary, theme.colors.card, CURSOR_ALPHA);
      for (const fg of ['ink', 'line', 'right', 'wrong', 'reveal'] as const) {
        expect(contrast(theme.colors[fg], tint), fg).toBeGreaterThanOrEqual(MIN.large);
      }
    });
  }

  it('the tint in the test matches the stylesheet, which uses theme variables only', () => {
    const css = readFileSync(`${process.cwd()}/src/ui/staffSequence.css`, 'utf8');
    expect(/\.staff-seq__cursor\s*\{[^}]*fill-opacity:\s*([\d.]+)/.exec(css)![1]).toBe(String(CURSOR_ALPHA));
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
