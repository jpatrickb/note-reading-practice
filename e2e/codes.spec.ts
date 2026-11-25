import { type Browser, expect, test } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { codeToBase32, decodeProfile } from '../src/core/codec';
import type { StudentState } from '../src/core/engine';
import { progressQr } from '../src/core/progress-qr';
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

  test('the Save screen QR code holds the base32 link in alphanumeric mode', async ({ page, baseURL }) => {
    const appUrl = new URL('/', baseURL).href;
    const viewBox = await page.locator('.qr svg').getAttribute('viewBox');
    const size = (count: number) => `0 0 ${count * 4 + 4} ${count * 4 + 4}`;
    expect(viewBox?.trim()).toBe(size(progressQr(appUrl, code).getModuleCount()));
    const plain = qrcode(0, 'L');
    plain.addData(`${appUrl}#import=${code}`);
    plain.make();
    expect(viewBox?.trim()).not.toBe(size(plain.getModuleCount()));
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

  test('a damaged QR link gets the friendly error, not a blank screen', async ({ browser }) => {
    const page = await otherDevice(browser);
    await page.goto(`/#import32=${codeToBase32(code).slice(0, 40)}`);
    await expect(page.getByTestId('import-error')).toBeVisible();
  });
});
