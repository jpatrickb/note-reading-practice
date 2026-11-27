import { type Page, expect, test } from '@playwright/test';
import { skipPlacement } from './skipPlacement';

// Place It: "Put a G on the staff". Tap a line or space; the answer is a position.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BOTTOM = { treble: 'E4', bass: 'G2' } as const;
const diatonic = (note: string) => LETTERS.indexOf(note[0]!) + 7 * Number(note.slice(1));

/** Staff position (0 = bottom line) of an item id like "place:treble:G4". */
function positionOf(id: string): number {
  const [, clef, note] = id.split(':') as [string, 'treble' | 'bass', string];
  return diatonic(note) - diatonic(BOTTOM[clef]);
}

async function start(page: Page, clef: 'Treble' | 'Bass' | 'Both' = 'Both') {
  await page.goto('/');
  await page.locator('.mode-card[data-mode="place"]').click();
  await page.getByRole('button', { name: clef, exact: true }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await skipPlacement(page);
}

async function question(page: Page): Promise<{ id: string; pos: number }> {
  await expect(page.locator('.staff-input:not([hidden]) .staff-input__slider[aria-disabled="false"]')).toBeVisible();
  const id = (await page.getByTestId('place-question').getAttribute('data-item'))!;
  return { id, pos: positionOf(id) };
}

/** Tap the middle of a position band on the visible staff. */
async function tapPos(page: Page, pos: number) {
  await page.locator(`.staff-input:not([hidden]) .staff-input__hit[data-pos="${pos}"]`).click();
}

test('Place It is on the home screen under Read notes, with the clef picker', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.mode-card[data-mode="place"]');
  await expect(card).toContainText('Place It');
  await card.click();
  await expect(card).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Clef' })).toBeVisible();
});

test('asks for a letter without giving away the answer, then a right tap moves on', async ({ page }) => {
  await start(page, 'Treble');
  const q = await question(page);
  await expect(page.locator('.place-prompt')).toContainText('Put');
  await expect(page.locator('.place-prompt')).not.toContainText(/line|space/);
  const slider = page.locator('.staff-input:not([hidden]) .staff-input__slider');
  await expect(slider).toHaveAttribute('aria-valuetext', 'no note chosen');
  // The prompt, and what a screen reader reaches, never names the position (the hit bands are aria-hidden).
  expect(await slider.getAttribute('aria-label')).not.toMatch(/\b[A-G]\b/);
  await expect(page.locator('.staff-input:not([hidden]) .staff-input__svg')).toHaveAttribute('aria-hidden', 'true');
  await tapPos(page, q.pos);
  await expect(page.locator('.praise')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await expect(page.locator('.staff-input:not([hidden]) .staff-input__placed')).toHaveCount(0, { timeout: 5000 });
});

test('a wrong placement shows the right spot beside it with a hint, and waits for Got it', async ({ page }) => {
  await start(page, 'Treble');
  const q = await question(page);
  await tapPos(page, q.pos === 9 ? 8 : q.pos + 1);
  await expect(page.getByTestId('continue')).toBeVisible();
  await expect(page.locator('.staff-input:not([hidden]) [data-mark="wrong"]')).toHaveCount(1);
  await expect(page.locator('.staff-input:not([hidden]) [data-reveal]')).toHaveCount(1);
  await expect(page.locator('.hint')).toContainText(/guide note|Count/);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('continue')).toBeVisible(); // it waits
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

test('the right letter in the wrong octave is wrong, with kind words', async ({ page }) => {
  await start(page, 'Treble');
  // Find a question with a same-letter spot an octave up (the top of the offered range is position 9).
  let q = await question(page);
  for (let i = 0; i < 12 && q.pos + 7 > 9; i++) {
    await page.locator('[data-answer="?"]').click();
    await page.getByTestId('continue').click();
    q = await question(page);
  }
  expect(q.pos + 7).toBeLessThanOrEqual(9);
  await tapPos(page, q.pos + 7);
  await expect(page.locator('.hint__lead')).toContainText(/but the one an octave lower/);
});

test('"?" shows the answer and waits for Got it', async ({ page }) => {
  await start(page, 'Bass');
  await question(page);
  await page.locator('[data-answer="?"]').click();
  await expect(page.locator('.staff-input:not([hidden]) [data-reveal]')).toHaveCount(1);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

test('keyboard: arrows move the ghost, Enter places it', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard is a desktop feature');
  await start(page, 'Treble');
  const q = await question(page);
  await page.locator('.staff-input:not([hidden]) .staff-input__slider').focus();
  await page.keyboard.press('ArrowUp'); // ghost on the middle line (4)
  for (let p = 4; p < q.pos; p++) await page.keyboard.press('ArrowUp');
  for (let p = 4; p > q.pos; p--) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.praise')).toBeVisible();
});

test('a perfect session of correct taps finishes with a summary and a Place It map', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page, 'Both');
  for (let i = 0; i < 20; i++) {
    const q = await question(page);
    await tapPos(page, q.pos);
    await expect(page.locator('.praise')).toBeVisible();
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
  await expect(page.getByTestId('place-map')).toBeVisible();
});
