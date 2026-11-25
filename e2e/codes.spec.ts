import { type Browser, expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';
import { codeToBase32, decodeProfile } from '../src/core/codec';
import type { StudentState } from '../src/core/engine';
import { codeFromHash } from '../src/core/progress-qr';
import * as frozen from '../tests/fixtures/codec-v3-frozen';
import { GOLDEN_CODES } from '../tests/fixtures/codes';

// Progress codes saved by earlier builds (v1/v2) must keep loading in the real app.

for (const key of ['v1Played', 'v2Played', 'v2Full'] as const) {
  test(`a ${key} code from an earlier build still loads`, async ({ page }) => {
    const g = GOLDEN_CODES[key]!;
    const gold = Object.values(g.expected.name.items).filter((i) => i.best === 2).length;
    const silver = Object.values(g.expected.name.items).filter((i) => i.best === 1).length;
    await page.goto(`/#import=${g.code}`);
    await expect(page.getByText(`This code has 🥇 ${gold} gold and 🥈 ${silver} silver keys.`)).toBeVisible();
    await expect(page.getByTestId('import-error')).toHaveCount(0);
    await page.getByTestId('confirm-import').click();
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
  });
}

// A kid with gold keys: their code uses compact gold records, and its QR code stores the code as
// uppercase base32 (QR alphanumeric mode). Every form of that code must import.

const played = GOLDEN_CODES.v3Played!.expected;
const goldOf = (s: StudentState) => Object.values(s.items).filter((i) => i.best === 2).length;
const silverOf = (s: StudentState) => Object.values(s.items).filter((i) => i.best === 1).length;
const importText = {
  name: `This code has 🥇 ${goldOf(played.name)} gold and 🥈 ${silverOf(played.name)} silver keys.`,
  letters: `Letter Math: 🥇 ${goldOf(played.letters)} gold and 🥈 ${silverOf(played.letters)} silver.`,
};

test.describe('a code with gold keys', () => {
  let code: string;

  // A link opens on another device: a fresh page (a hash-only change on this one wouldn't reload the app).
  const otherDevice = async (browser: Browser) => (await browser.newContext()).newPage();

  test.beforeEach(async ({ page }) => {
    expect(goldOf(played.name)).toBeGreaterThan(0);
    await page.addInitScript(
      ([name, letters]) => {
        localStorage.setItem('nrp:v1:state', name!);
        localStorage.setItem('nrp:v1:state:letters', letters!);
      },
      [JSON.stringify(played.name), JSON.stringify(played.letters)],
    );
    await page.goto('/');
    await page.getByRole('button', { name: /Save/ }).click();
    code = await page.getByTestId('progress-code').inputValue();
  });

  test('is written in the compact gold layout that earlier builds refuse', () => {
    expect(() => frozen.decodeProfile(code, Date.now())).toThrow(/different version/);
    expect(decodeProfile(code, Date.now()).name.items['name:treble:G4']!.best).toBe(2);
  });

  test('scanning the Save screen QR code gives the base32 link, which imports', async ({ page, browser, baseURL }) => {
    // Rasterize the QR the way a camera sees it (black on white, quiet zone included) and decode it.
    const raster = await page.evaluate(async () => {
      const svg = document.querySelector('.qr svg')!;
      const side = Number(svg.getAttribute('viewBox')!.trim().split(/\s+/)[2]);
      const scale = 4;
      const xml = new XMLSerializer().serializeToString(svg).replace('<svg ', `<svg width="${side * scale}" height="${side * scale}" `);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = side * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let bin = '';
      for (let i = 0; i < px.length; i += 8192) bin += String.fromCharCode(...px.subarray(i, i + 8192));
      return { width: canvas.width, height: canvas.height, base64: btoa(bin) };
    });
    const pixels = Uint8ClampedArray.from(Buffer.from(raster.base64, 'base64'));
    const scanned = jsQR(pixels, raster.width, raster.height)?.data;
    expect(scanned).toBe(`${new URL('/', baseURL).href}#import32=${codeToBase32(code)}`);

    // The scanned link opens the import screen on another device, with the same code inside.
    expect(codeFromHash(`#${scanned!.split('#')[1]}`)).toBe(code);
    const other = await otherDevice(browser);
    await other.goto(scanned!);
    await expect(other.getByText(importText.name)).toBeVisible();
    await expect(other.getByTestId('import-error')).toHaveCount(0);
  });

  test('the QR code is smaller than one holding the base64 link', async ({ page, baseURL }) => {
    const appUrl = new URL('/', baseURL).href;
    const viewBox = await page.locator('.qr svg').getAttribute('viewBox');
    const plain = qrcode(0, 'L');
    plain.addData(`${appUrl}#import=${code}`);
    plain.make();
    const side = Number(viewBox!.trim().split(/\s+/)[2]);
    expect((side - 4) / 4).toBeLessThan(plain.getModuleCount());
  });

  test('imports from the QR link (base32)', async ({ browser }) => {
    const page = await otherDevice(browser);
    await page.goto(`/#import32=${codeToBase32(code)}`);
    await expect(page.getByText(importText.name)).toBeVisible();
    await expect(page.getByText(importText.letters)).toBeVisible();
    await expect(page.getByTestId('import-error')).toHaveCount(0);
    await page.getByTestId('confirm-import').click();
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
  });

  test('imports from an all-uppercase QR link', async ({ browser }) => {
    const page = await otherDevice(browser);
    await page.goto(`/#IMPORT32=${codeToBase32(code)}`);
    await expect(page.getByText(importText.name)).toBeVisible();
    await expect(page.getByTestId('import-error')).toHaveCount(0);
  });

  test('imports from the base64 link', async ({ browser }) => {
    const page = await otherDevice(browser);
    await page.goto(`/#import=${code}`);
    await expect(page.getByText(importText.name)).toBeVisible();
    await expect(page.getByText(importText.letters)).toBeVisible();
  });

  test('imports from the text code pasted on the Save screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Save/ }).click();
    await page.getByLabel('Progress code to load').fill(code);
    await page.getByRole('button', { name: 'Load…' }).click();
    await expect(page.getByText(importText.name)).toBeVisible();
    await expect(page.getByText(importText.letters)).toBeVisible();
  });

  test('imports from a whole link pasted on the Save screen', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Save/ }).click();
    await page.getByLabel('Progress code to load').fill(`${new URL('/', baseURL).href}#import32=${codeToBase32(code)}`);
    await page.getByRole('button', { name: 'Load…' }).click();
    await expect(page.getByText(importText.name)).toBeVisible();
  });

  test('a link in a format from a newer build says so', async ({ browser }) => {
    const page = await otherDevice(browser);
    await page.goto('/#import64=ABCDEFGH');
    await expect(page.getByTestId('import-error')).toContainText('different version');
  });

  test('a damaged QR link gets the friendly error, not a blank screen', async ({ browser }) => {
    const page = await otherDevice(browser);
    await page.goto(`/#import32=${codeToBase32(code).slice(0, 40)}`);
    await expect(page.getByTestId('import-error')).toBeVisible();
  });
});
