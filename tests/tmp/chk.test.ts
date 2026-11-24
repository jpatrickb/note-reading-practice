import { it } from 'vitest';
import { THEMES, checkTheme } from '../../src/core/themes';
it('x', () => {
  for (const t of THEMES) for (const r of checkTheme(t)) if (!r.ok || process.env.ALL) process.stderr.write("\n"+[t.id, r.fg, r.bg, r.kind, r.value.toFixed(2)].join(" "));
});
