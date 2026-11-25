import { type Page, expect, test } from '@playwright/test';

// Note Catcher: a note on the staff, tap its exact key on the on-screen piano.

const piano = (page: Page) => page.locator('.piano');
const key = (page: Page, note: string) => piano(page).locator(`[data-note="${note}"]`);

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /Note Catcher/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
}

/** Wait for an answerable question; its note is on the staff's data-note. */
async function shownNote(page: Page): Promise<string> {
  await expect(page.locator('.piano__key[aria-disabled="true"]')).toHaveCount(0);
  await expect(page.locator('.staff')).toBeVisible();
  return (await page.locator('.staff').getAttribute('data-note'))!;
}

test('the home screen offers Note Catcher under Find keys', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find keys' })).toBeVisible();
  await expect(page.locator('.mode-card[data-mode="catch"]')).toContainText('See the note, tap the key');
});

test('a perfect session: tap the key for each note shown', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  for (let i = 0; i < 20; i++) {
    const note = await shownNote(page);
    await key(page, note).click();
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
});

test('the piano gives nothing away during a question', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  await expect(piano(page).locator('.piano__label')).toHaveCount(0);
  await expect(piano(page).locator('.piano__dot')).toHaveCount(0); // a middle-C dot would mark every C4 question
  const labels = await piano(page)
    .locator('.piano__key')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  for (const l of labels) expect(l).toMatch(/^(Piano key \d+ of \d+|Black key after white key \d+)$/);
  await expect(page.locator('.staff')).not.toHaveAttribute('aria-label', /the note/);
  // After the answer, the keys are named again.
  await key(page, note).click();
  await expect(key(page, note)).toHaveAttribute('aria-label', new RegExp(`^${note}`));
  await expect(piano(page).locator('.piano__dot')).toHaveCount(1); // the landmark appears with the answer
});

test('the right letter in the wrong octave is wrong, kindly, and shows the right key', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  const slip = `${note[0]}${Number(note.slice(1)) + 1}`;
  await key(page, slip).click();
  await expect(page.locator('.hint__lead')).toContainText("That's the right letter, but one octave too high.");
  await expect(key(page, slip)).toHaveAttribute('data-mark', 'wrong');
  await expect(key(page, note)).toHaveAttribute('data-mark', 'target');
  await page.getByTestId('continue').click();
  await shownNote(page);
});

test('a black key is not an answer: a gentle tip, nothing scored, tap again', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  await piano(page).locator('.piano__key--black').first().click();
  await expect(page.getByTestId('catcher-tip')).toContainText("That's a black key.");
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await expect(page.locator('.piano__key[data-mark]')).toHaveCount(0);
  await key(page, note).click();
  await expect(page.locator('.piano__key--right')).toHaveCount(1);
});

test('"?" marks the key, explains, and waits for Got it', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  await page.locator('[data-answer="?"]').click();
  await expect(key(page, note)).toHaveAttribute('data-mark', 'target');
  await expect(page.locator('.hint__lead')).toContainText('This note is');
  await page.getByTestId('continue').click();
  await shownNote(page);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 760 }, hasTouch: true });

  test('the piano shows a window of the range, keys stay at least 44px, and the note is on it', async ({ page }) => {
    await start(page);
    const note = await shownNote(page);
    await expect(piano(page).locator('.piano__key--white')).toHaveCount(7);
    const box = (await piano(page).locator('.piano__key--white').first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(key(page, note)).toBeVisible();
    await key(page, note).tap();
    await expect(page.locator('.piano__key--right')).toHaveCount(1);
  });

  test('at 320px the window drops to 6 keys so they stay 44px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await start(page);
    await shownNote(page);
    await expect(piano(page).locator('.piano__key--white')).toHaveCount(6);
    const box = (await piano(page).locator('.piano__key--white').first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
  });
});
