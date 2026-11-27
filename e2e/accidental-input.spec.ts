import { createServer as createNetServer } from 'node:net';
import { expect, test } from '@playwright/test';
import { type ViteDevServer, createServer } from 'vite';

// The accidental answer keyboard (issue #33) on its dev harness page. Hit areas are measured in a real browser:
// black keys are answers here, so each must be at least 44px wide to touch, at phone widths too.

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

test('black keys have a hit area of at least 44px at 320, 375 and 390px, and win over the white key beneath', async ({ page }) => {
  const port = await freePort();
  const server: ViteDevServer = await createServer({ server: { port, strictPort: true }, logLevel: 'silent' });
  await server.listen();
  try {
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`http://localhost:${port}/dev/answer-input.html?style=keys`);
      await expect(page.locator('.piano__key--black')).toHaveCount(5);
      const keys = await page.locator('.piano__key').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          const black = el.classList.contains('piano__key--black');
          // Probe 8px inside the left and right edges of the hit area (neighbouring black keys may overlap by a few px at 320), at the key's top (where black meets white).
          const at = (x: number) => document.elementFromPoint(x, r.top + 10)?.closest('.piano__key') === el;
          return { note: (el as HTMLElement).dataset.note, black, width: r.width, edges: at(r.left + 8) && at(r.right - 8) };
        }),
      );
      for (const k of keys.filter((k) => k.black)) {
        expect(k.width, `${k.note} at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(k.edges, `${k.note} wins both edges of its hit area at ${width}px`).toBe(true);
      }
      for (const k of keys.filter((k) => !k.black)) expect(k.width, `${k.note} at ${width}px`).toBeGreaterThanOrEqual(40);
      // No horizontal page scroll.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  } finally {
    await server.close();
  }
});
