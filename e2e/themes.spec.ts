import { type Page, expect, test } from '@playwright/test';
import { skipPlacement } from './skipPlacement';

const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const themeColor = (page: Page) => page.locator('meta[name="theme-color"]').getAttribute('content');

async function openPicker(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Theme/ }).click();
  await expect(page.getByRole('radiogroup', { name: /Pick a theme/ })).toBeVisible();
}

test('picking a theme applies it everywhere and survives a reload', async ({ page, hasTouch }) => {
  await openPicker(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunny');
  await expect(page.getByRole('radio', { name: 'Sunny' })).toHaveAttribute('aria-checked', 'true');

  const space = page.getByRole('radio', { name: 'Space' });
  if (hasTouch) await space.tap();
  else await space.click();

  // Applies instantly, including the browser chrome color.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'space');
  await expect(space).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Sunny' })).toHaveAttribute('aria-checked', 'false');
  expect(await bg(page)).toBe('rgb(15, 18, 38)');
  expect(await themeColor(page)).toBe('#0f1226');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: /Note Reader/ })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'space');
  expect(await bg(page)).toBe('rgb(15, 18, 38)');
  expect(await themeColor(page)).toBe('#0f1226');

  // The game itself is themed: the staff is drawn in the theme's colors.
  await page.getByRole('button', { name: /Start/ }).click();
  await skipPlacement(page);
  const line = page.locator('svg.staff .staff__line').first();
  await expect(line).toHaveCSS('stroke', 'rgb(213, 217, 245)');
});

test('the saved theme is applied before the app renders (no flash of the default)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: true, theme: 'forest' }));
    // Record the theme the moment the first screen is in the DOM.
    new MutationObserver((_, obs) => {
      if (document.querySelector('#app main')) {
        (window as unknown as { firstTheme: string | undefined }).firstTheme = document.documentElement.dataset.theme;
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Note Reader/ })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { firstTheme: string }).firstTheme)).toBe('forest');
});

test('the picker works with the keyboard alone', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard navigation is a desktop feature');
  await page.goto('/');
  // Tab to the Theme button and open it with Enter.
  const themeBtn = page.getByRole('button', { name: /Theme/ });
  for (let i = 0; i < 12 && !(await themeBtn.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(themeBtn).toBeFocused();
  await page.keyboard.press('Enter');

  // Focus lands on the current theme; arrows move and pick.
  await expect(page.getByRole('radio', { name: 'Sunny' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Ocean' })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await page.keyboard.press('End');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'studio');
  await page.keyboard.press('ArrowRight'); // wraps around
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunny');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Studio' })).toHaveAttribute('aria-checked', 'true');

  // Only the chosen theme is a Tab stop; Tab moves on to the Calm mode switch, then Done.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('switch', { name: 'Calm mode' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Note Reader/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'studio');
});

test('answer feedback uses the theme’s readable colors (dark theme)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: true, theme: 'space' })));
  await page.goto('/');
  await page.getByRole('button', { name: /Start/ }).click();
  await skipPlacement(page);
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  const letter = (await page.locator('svg.staff').getAttribute('data-note'))![0]!;
  const wrong = letter === 'C' ? 'D' : 'C';
  await page.locator(`[data-answer="${wrong}"]`).click();
  // Dark ink on the bright right/wrong keys (not the muted color of the other, disabled keys).
  await expect(page.locator(`[data-answer="${letter}"]`)).toHaveCSS('color', 'rgb(15, 18, 38)');
  await expect(page.locator(`[data-answer="${letter}"]`)).toHaveCSS('background-color', 'rgb(105, 219, 124)');
  await expect(page.locator(`[data-answer="${wrong}"]`)).toHaveCSS('color', 'rgb(15, 18, 38)');
  await expect(page.locator('.hint')).toHaveCSS('color', 'rgb(238, 240, 255)');
});

test('theme cards are big enough to tap', async ({ page }) => {
  await openPicker(page);
  const boxes = await page.getByRole('radio').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  expect(boxes).toHaveLength(6);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
