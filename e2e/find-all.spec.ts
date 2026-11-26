import { type Page, expect, test } from '@playwright/test';

// Find All: tap every key with the named letter on the one C2-C6 keyboard.

const piano = (page: Page) => page.locator('.piano');
const key = (page: Page, note: string) => piano(page).locator(`[data-note="${note}"]`);

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /Find All/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
}

/** The letter asked, once the question is answerable; its keys on the 29-white-key keyboard. */
async function asked(page: Page): Promise<{ letter: string; targets: string[] }> {
  await expect(page.locator('.piano__key[aria-disabled="true"]')).toHaveCount(0);
  await expect(page.getByTestId('find-question')).toBeVisible();
  const letter = (await page.locator('.lm-letter').textContent())!.trim();
  const octaves = letter === 'C' ? [2, 3, 4, 5, 6] : [2, 3, 4, 5];
  return { letter, targets: octaves.map((o) => `${letter}${o}`) };
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
  await expect(page.locator('.piano [data-mark]')).toHaveCount(0);
  await page.getByRole('button', { name: "I don't know" }).click();
  await expect(page.locator('.piano__key--target')).toHaveCount(targets.length);
  await expect(page.getByTestId('continue')).toBeVisible();
});
