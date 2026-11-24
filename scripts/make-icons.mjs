// Generates the app icons in public/icons/ from one original SVG design (a smiling eighth note).
// Run with `node scripts/make-icons.mjs` after changing the design; it rasterizes with the Chromium
// that @playwright/test already installs (`npx playwright install chromium` if it's missing).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const BG = '#d9480f'; // --primary in the default theme
const NOTE = '#fff8ec'; // --bg in the default theme
const INK = '#2b2a33'; // --ink

/** The note, drawn on a 512×512 canvas and centred on (256, 256). */
const note = `
  <path d="M292 96 h34 v276 h-34 z" fill="${NOTE}"/>
  <path d="M292 96 c18 52 120 74 108 170 c-4 30 -18 52 -30 64 c14 -44 10 -78 -14 -104 c-18 -20 -42 -30 -64 -34 z" fill="${NOTE}"/>
  <g transform="rotate(-22 232 382)">
    <ellipse cx="232" cy="382" rx="96" ry="72" fill="${NOTE}"/>
    <circle cx="204" cy="366" r="11" fill="${INK}"/>
    <circle cx="260" cy="366" r="11" fill="${INK}"/>
    <path d="M196 396 q36 30 72 0" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
  </g>`;

/**
 * @param {{ size: number, radius: number, scale: number }} v radius: corner rounding (0 = full
 *   bleed square); scale: how big the note is (maskable icons keep it inside the 80% safe circle).
 */
function svg({ size, radius, scale }) {
  const t = `translate(256 256) scale(${scale}) translate(-268 -275)`; // (268, 275): the note's centre
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
  <g transform="${t}">${note}</g>
</svg>`;
}

const variants = [
  { file: 'icon-192.png', size: 192, radius: 96, scale: 0.92 },
  { file: 'icon-512.png', size: 512, radius: 96, scale: 0.92 },
  { file: 'maskable-512.png', size: 512, radius: 0, scale: 0.7 },
  // iOS rounds the corners itself and shows transparency as black, so full bleed.
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 0.85 },
];

writeFileSync(join(OUT, 'icon.svg'), svg({ size: 512, radius: 96, scale: 0.92 }) + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const v of variants) {
  await page.setViewportSize({ width: v.size, height: v.size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(v)}`);
  await page.locator('svg').screenshot({ path: join(OUT, v.file), omitBackground: true });
  console.log(`wrote public/icons/${v.file}`);
}
await browser.close();
