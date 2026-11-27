import { type Page, expect, test } from '@playwright/test';

// Find All: tap every key with the named letter on the one C2-C6 keyboard.

// The keyboard scrolls smoothly (CSS scroll-behavior), and Playwright scrolls an off-screen key into view
// before clicking it. On WebKit that click can land while the keyboard is still gliding, on a neighbouring
// key (#95). Reduced motion makes every scroll instant, so a click always hits the key it targeted.
test.use({ reducedMotion: 'reduce' });

const piano = (page: Page) => page.locator('.piano');
const key = (page: Page, note: string) => piano(page).locator(`[data-note="${note}"]`);

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /Find All/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
}

/** The letter asked, once the question is answerable; its keys (a fresh profile is in stage 1: the two octaves C3-B4). */
async function asked(page: Page): Promise<{ letter: string; targets: string[] }> {
  await expect(page.locator('.piano__key[aria-disabled="true"]')).toHaveCount(0);
  await expect(page.getByTestId('find-question')).toBeVisible();
  const letter = (await page.locator('.lm-letter').textContent())!.trim();
  return { letter, targets: [`${letter}3`, `${letter}4`] };
}

test('the home screen offers Find All under Find keys', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find keys' })).toBeVisible();
  await expect(page.locator('.mode-card[data-mode="find"]')).toContainText('Find every key with that name');
});

test('a perfect session: find every key for each letter, the counter counts', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  for (let i = 0; i < 20; i++) {
    const { letter, targets } = await asked(page);
    await expect(page.getByTestId('find-count')).toHaveText(`0 of ${targets.length} found`);
    await expect(piano(page).locator('.piano__key--white')).toHaveCount(29);
    for (const [n, t] of targets.entries()) {
      await key(page, t).click();
      if (n < targets.length - 1) await expect(page.getByTestId('find-count')).toHaveText(`${n + 1} of ${targets.length} found`);
    }
    expect(letter).toMatch(/^[A-G]$/);
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
});

test('a wrong tap reveals every target, waits for Got it, and the next question starts fresh', async ({ page }) => {
  await start(page);
  const { letter, targets } = await asked(page);
  await key(page, targets[0]!).click();
  await expect(key(page, targets[0]!)).toHaveAttribute('data-mark', 'found');
  const wrong = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].find((l) => l !== letter)! + '3';
  await key(page, wrong).click();
  await expect(key(page, wrong)).toHaveAttribute('data-mark', 'wrong');
  await expect(page.locator('.piano__key--target')).toHaveCount(targets.length - 1);
  await expect(page.locator('.hint__lead')).toContainText(`We were finding ${letter}s`);
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.getByTestId('continue').click();
  await asked(page);
  await expect(page.locator('.piano [data-mark]')).toHaveCount(0);
});

test('a black key is not an answer, and "?" teaches', async ({ page }) => {
  await start(page);
  const { targets } = await asked(page);
  await key(page, 'C#3').click();
  await expect(page.getByTestId('catcher-tip')).toContainText('black key');
  await key(page, 'C5').click(); // outside the tinted zone: a tip, not a miss
  await expect(page.getByTestId('catcher-tip')).toContainText('tinted');
  await expect(page.locator('.piano [data-mark]')).toHaveCount(0);
  await page.getByRole('button', { name: "I don't know" }).click();
  await expect(page.locator('.piano__key--target')).toHaveCount(targets.length);
  await expect(page.getByTestId('continue')).toBeVisible();
});

test('stage 1 tints the two octaves around middle C, the same 14 keys for every letter', async ({ page }) => {
  await start(page);
  await asked(page);
  await expect(page.locator('.piano__key.is-zone')).toHaveCount(14);
  await expect(key(page, 'C3')).toHaveClass(/is-zone/);
  await expect(key(page, 'B4')).toHaveClass(/is-zone/);
  await expect(key(page, 'C5')).not.toHaveClass(/is-zone/);
  await expect(page.locator('.piano [data-mark]')).toHaveCount(0);
});

test('a swipe across the keys does not find a key, but a tap does (runs on iPad WebKit too)', async ({ page }) => {
  await start(page);
  const { targets } = await asked(page);
  const target = key(page, targets[0]!);
  await target.scrollIntoViewIfNeeded();
  const b = (await target.boundingBox())!;
  const touch = (type: string, x: number) =>
    target.evaluate(
      (el, a) => {
        const e = new PointerEvent(a.type, { bubbles: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: a.x, clientY: 40 });
        (a.type === 'pointerup' ? document : el).dispatchEvent(e);
      },
      { type, x },
    );
  await touch('pointerdown', b.x + 10);
  await touch('pointermove', b.x + 90);
  await touch('pointerup', b.x + 90);
  await expect(page.locator('.piano [data-mark]')).toHaveCount(0);
  await expect(page.getByTestId('find-count')).toHaveText(`0 of ${targets.length} found`);
  await touch('pointerdown', b.x + 10);
  await touch('pointerup', b.x + 10);
  await expect(target).toHaveAttribute('data-mark', 'found');
  await expect(page.getByTestId('find-count')).toHaveText(`1 of ${targets.length} found`);
});
