import { type Page, expect, test } from '@playwright/test';

// The home mode chooser, the per-mode profile, and the mode-by-mode save/load of progress.

const STATE_KEYS = ['nrp:v1:state', 'nrp:v1:state:letters'];

const card = (page: Page, mode: string) => page.locator(`.mode-card[data-mode="${mode}"]`);

/** Answer the current question (anything: right or wrong, it is progress either way). */
async function answerOne(page: Page, answer = 'C') {
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  await page.locator(`[data-answer="${answer}"]`).click();
  await expect(page.locator('.praise, .hint').first()).toBeVisible();
}

async function playSome(page: Page, mode: 'name' | 'letters', questions = 4) {
  await card(page, mode).click();
  await page.getByRole('button', { name: /Start/ }).click();
  for (let i = 0; i < questions; i++) {
    await answerOne(page);
    // A wrong answer or "?" waits for "Got it"; a right one moves on by itself.
    const next = page.getByTestId('continue');
    if (await next.isVisible()) await next.click();
    const lesson = page.getByTestId('lesson');
    if (await lesson.isVisible()) await page.getByTestId('continue').click();
  }
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
}

test('home shows a card per mode, grouped under headings, with the chosen one marked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('mode-chooser')).toBeVisible();
  await expect(page.locator('.mode-card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Read notes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alphabet & theory' })).toBeVisible();
  await expect(card(page, 'name')).toContainText('Read the note, tap its name');
  await expect(card(page, 'letters')).toContainText('Next letter, skips and intervals');
  // Name It is chosen by default, and says so without relying on color.
  await expect(card(page, 'name')).toHaveAttribute('aria-checked', 'true');
  await expect(card(page, 'name').locator('.icon--check')).toBeVisible();
  await expect(card(page, 'letters')).toHaveAttribute('aria-checked', 'false');
});

test('the chosen mode persists across a reload, and only clef modes show the clef picker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Clef' })).toBeVisible();
  await card(page, 'letters').click();
  await expect(card(page, 'letters')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Clef' })).toHaveCount(0);
  await page.reload();
  await expect(card(page, 'letters')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Clef' })).toHaveCount(0);
  await card(page, 'name').click();
  await expect(page.getByRole('group', { name: 'Clef' })).toBeVisible();
});

test('the keyboard focus ring shows on the chosen card, and arrow keys move the choice', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard navigation is a desktop feature');
  await page.goto('/');
  const name = card(page, 'name');
  // Tab to the chosen card (the group's one tab stop).
  for (let i = 0; i < 12 && !(await name.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(name).toBeFocused();
  // The ring is the theme's focus color (Sunny: reveal #1c7ed6), not the card's own outline.
  await expect(name).toHaveCSS('outline-color', 'rgb(28, 126, 214)');
  await expect(name).toHaveCSS('outline-style', 'solid');
  // Arrow keys choose the next mode and keep focus on it.
  await page.keyboard.press('ArrowRight'); // Place It shares the Read notes group
  await expect(card(page, 'place')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(card(page, 'letters')).toHaveAttribute('aria-checked', 'true');
  await expect(card(page, 'letters')).toBeFocused();
  await expect(page.getByRole('group', { name: 'Clef' })).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(card(page, 'name')).toHaveAttribute('aria-checked', 'true');
});

test('the clef choice is remembered for Name It', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Bass', exact: true }).click();
  await card(page, 'letters').click();
  await card(page, 'name').click();
  await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('an unknown saved mode falls back to Name It', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: true, mode: 'from-the-future' })));
  await page.goto('/');
  await expect(card(page, 'name')).toHaveAttribute('aria-checked', 'true');
});

test('a locked mode is shown with its reason and cannot be chosen', async ({ page }) => {
  await page.goto('/?debug');
  const locked = card(page, 'demo-locked');
  await expect(locked).toBeVisible();
  await expect(locked).toContainText('Learn 7 notes in Name It first!');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await locked.click({ force: true }); // aria-disabled: Playwright would wait forever for it to be "enabled"
  await expect(locked).toHaveAttribute('aria-checked', 'false');
  await expect(card(page, 'name')).toHaveAttribute('aria-checked', 'true');
  // Without ?debug the demo is not there.
  await page.goto('/');
  await expect(card(page, 'demo-locked')).toHaveCount(0);
});

test('mode cards and the Start button are touch-sized, and the page never scrolls sideways', async ({ page }) => {
  await page.goto('/?debug');
  for (const c of await page.locator('.mode-card').all()) {
    const box = (await c.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const start = (await page.getByRole('button', { name: /Start/ }).boundingBox())!;
  expect(start.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('progress from two modes exports to a code and imports with both restored', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await playSome(page, 'name');
  await playSome(page, 'letters');

  await page.getByRole('button', { name: /Save/ }).click();
  const code = await page.getByTestId('progress-code').inputValue();
  expect(code.length).toBeGreaterThan(20);

  // A different device: clear everything, then open the code.
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: /My progress/ }).click();
  await expect(page.getByText('Play a game and your progress will show up here!')).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.getByLabel('Progress code to load').fill(code);
  await page.getByRole('button', { name: 'Load…' }).click();
  // The preview says which modes the code carries.
  const modes = page.getByTestId('import-modes');
  await expect(modes.locator('li')).toHaveCount(2);
  await expect(modes).toContainText('Name It');
  await expect(modes).toContainText('Letter Math');
  await page.getByTestId('confirm-import').click();
  await expect(page.locator('.toast')).toContainText('Name It, Letter Math');

  await page.getByRole('button', { name: /My progress/ }).click();
  await expect(page.locator('.map section[data-mode="name"]')).toBeVisible();
  await expect(page.locator('.map section[data-mode="letters"]')).toBeVisible();
  // And both are on disk, in the keys they have always used.
  for (const key of STATE_KEYS) expect(await page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
});

test('My progress shows a section only for the modes that have progress', async ({ page }) => {
  await page.goto('/');
  await playSome(page, 'letters', 2);
  await page.getByRole('button', { name: /My progress/ }).click();
  await expect(page.locator('.map section[data-mode="letters"]')).toBeVisible();
  await expect(page.locator('.map section[data-mode="name"]')).toHaveCount(0);
});

// Issue #72: a state with missing fields used to crash the play screen.
test('a minimal saved state { version: 1, items: {} } still plays Name It and Letter Math', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate((keys) => {
    for (const k of keys) localStorage.setItem(k, JSON.stringify({ version: 1, items: {} }));
  }, STATE_KEYS);
  await page.reload();

  await card(page, 'name').click();
  await page.getByRole('button', { name: /Start/ }).click();
  await answerOne(page);
  await page.getByRole('button', { name: 'Stop and go home' }).click();

  await card(page, 'letters').click();
  await page.getByRole('button', { name: /Start/ }).click();
  await answerOne(page);
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  expect(errors).toEqual([]);
});
