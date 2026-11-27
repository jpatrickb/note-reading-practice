import { type Page, expect, test } from '@playwright/test';
import { skipPlacement } from './skipPlacement';

// Key to Staff: a key lights up on the piano; tap where it goes on the staff.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BOTTOM = { treble: 'E4', bass: 'G2' } as const;
const diatonic = (note: string) => LETTERS.indexOf(note[0]!) + 7 * Number(note.slice(1));

async function start(page: Page, clef: 'Treble' | 'Bass' | 'Both' = 'Both') {
  await page.goto('/');
  await page.locator('.mode-card[data-mode="k2s"]').click();
  await page.getByRole('button', { name: clef, exact: true }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await skipPlacement(page);
}

/** The lit key and where it goes on the visible staff. */
async function question(page: Page): Promise<{ note: string; clef: 'treble' | 'bass'; pos: number }> {
  await expect(page.locator('.staff-input:not([hidden]) .staff-input__slider[aria-disabled="false"]')).toBeVisible();
  await expect(page.locator('.piano__key--glow')).toHaveCount(1);
  const note = (await page.locator('.piano__key--glow').getAttribute('data-note'))!;
  const clef = (await page.locator('.staff-input:not([hidden])').getAttribute('data-clef')) as 'treble' | 'bass';
  return { note, clef, pos: diatonic(note) - diatonic(BOTTOM[clef]) };
}

async function tapPos(page: Page, pos: number) {
  await page.locator(`.staff-input:not([hidden]) .staff-input__hit[data-pos="${pos}"]`).click();
}

test('Key to Staff is on the home screen under Find keys, with the clef picker', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.mode-card[data-mode="k2s"]');
  await expect(card).toContainText('Key to Staff');
  await card.click();
  await expect(card).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Clef' })).toBeVisible();
});

test('the lit key is in view, the keys carry no names, and middle C keeps its anchor', async ({ page }) => {
  await start(page, 'Treble');
  const q = await question(page);
  await expect(page.locator('.k2s-prompt')).toHaveText('Where does this key go on the staff?');
  await expect(page.locator('.piano__label')).toHaveCount(0);
  await expect(page.locator('.piano__dot')).toHaveCount(1);
  await expect(page.locator('.piano__key--white')).toHaveCount(29); // the one C2 to C6 keyboard
  const lit = page.locator('.piano__key--glow');
  await expect(lit).toBeInViewport();
  if (q.note !== 'C4') expect(await lit.getAttribute('aria-label')).not.toContain(q.note);
  // Only the question's clef is shown, and the staff offers no letters.
  await expect(page.locator('.staff-input:not([hidden])')).toHaveCount(1);
});

test('a right tap moves on to a clean staff', async ({ page }) => {
  await start(page, 'Treble');
  const q = await question(page);
  await tapPos(page, q.pos);
  await expect(page.locator('.praise')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await expect(page.locator('.staff-input:not([hidden]) .staff-input__placed')).toHaveCount(0, { timeout: 5000 });
});

test('a wrong placement reveals the right spot with a hint, and waits for Got it', async ({ page }) => {
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
  let q = await question(page);
  // Find a key with the same letter an octave away on the offered staff (positions -2 to 9).
  for (let i = 0; i < 12 && q.pos + 7 > 9; i++) {
    await page.locator('[data-answer="?"]').click();
    await page.getByTestId('continue').click();
    q = await question(page);
  }
  expect(q.pos + 7).toBeLessThanOrEqual(9);
  await tapPos(page, q.pos + 7);
  await expect(page.locator('.hint__lead')).toContainText(/right letter, but one octave too high/);
});

test('"?" shows the answer and waits for Got it', async ({ page }) => {
  await start(page, 'Bass');
  await question(page);
  await page.locator('[data-answer="?"]').click();
  await expect(page.locator('.staff-input:not([hidden]) [data-reveal]')).toHaveCount(1);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

test('a perfect session across both clefs finishes with a summary and a Key to Staff map', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page, 'Both');
  for (let i = 0; i < 20; i++) {
    const q = await question(page);
    await tapPos(page, q.pos);
    await expect(page.locator('.praise')).toBeVisible();
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
  await expect(page.getByTestId('k2s-map')).toBeVisible();
});

test('the keyboard scroll depends only on the lit key: middle C is in view whenever it fits, whatever the kid answered', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page, 'Both');
  const seen = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const q = await question(page);
    expect(q.note).not.toBe('C4'); // middle C is the anchor, never a question
    const view = (await page.locator('.piano__scroller').boundingBox())!;
    const lit = (await page.locator('.piano__key--glow').boundingBox())!;
    const c4 = (await page.locator('.piano__key[data-note="C4"]').boundingBox())!;
    const left = await page.locator('.piano__scroller').evaluate((e) => Math.round(e.scrollLeft));
    const span = Math.max(lit.x + lit.width, c4.x + c4.width) - Math.min(lit.x, c4.x);
    if (span <= view.width) {
      expect(c4.x).toBeGreaterThanOrEqual(view.x - 1);
      expect(c4.x + c4.width).toBeLessThanOrEqual(view.x + view.width + 1);
    }
    // The same lit key always starts at the same scroll position, right or wrong.
    if (seen.has(q.note)) expect(left).toBe(seen.get(q.note));
    seen.set(q.note, left);
    if (i % 2) {
      await tapPos(page, q.pos);
      await expect(page.locator('.praise')).toBeVisible();
    } else {
      await page.locator('[data-answer="?"]').click();
      await page.getByTestId('continue').click();
    }
  }
});
