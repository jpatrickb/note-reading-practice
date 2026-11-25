import { type Page, expect, test } from '@playwright/test';

// The placement round (issue #32): offered on a fresh lane, low-pressure, and then a normal session.

const result = (page: Page) => page.getByTestId('placement-result');

async function startNameIt(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Treble', exact: true }).click();
  await page.getByRole('button', { name: /Start/ }).click();
}

/** Answer every placement question (right: the note's letter; else "?") until the result shows. */
async function runRound(page: Page, answer: 'right' | 'idk') {
  test.setTimeout(90_000);
  const pad = page.locator('.pad__key:not([disabled])').first();
  for (let i = 0; i < 20; i++) {
    await expect(pad.or(result(page))).toBeVisible();
    if (await result(page).isVisible()) return;
    // Never a wrong mark, a medal, a lesson or a "Got it" during the round.
    await expect(page.locator('.pad__key--wrong, .praise, .hint, .lesson, [data-testid=continue]')).toHaveCount(0);
    const letter = (await page.locator('svg.staff').getAttribute('data-note'))![0]!;
    await page.locator(`[data-answer="${answer === 'right' ? letter : '?'}"]`).click();
    await expect(page.getByTestId('placement-ack').or(result(page))).toBeVisible();
  }
  throw new Error('placement did not finish within 20 answers');
}

const openKeys = (page: Page) => page.locator('.key:not([data-level="locked"])');

test('a fresh lane offers placement, and a kid who knows their notes starts higher', async ({ page }) => {
  await startNameIt(page);
  await expect(page.getByTestId('placement-offer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show me what you know' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start from the beginning' })).toBeVisible();
  await page.getByRole('button', { name: 'Show me what you know' }).click();
  await expect(page.getByTestId('placement-hint')).toContainText('Tap ?');
  await runRound(page, 'right');
  await expect(page.getByTestId('placement-line')).toContainText("You're starting at");
  await expect(page.getByTestId('placement-line')).toContainText('in the treble clef');
  await expect(page.getByTestId('placement-line')).toContainText('mastery keys fill in as you play');
  // No score and no medals on the result.
  await expect(result(page)).not.toContainText(/\d+ of \d+|gold|silver/i);
  await page.getByRole('button', { name: /Let's play/ }).click();
  // Straight into a normal session.
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  await expect(page.getByTestId('placement-hint')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  await page.getByRole('button', { name: /My progress/ }).click();
  expect(await openKeys(page).count()).toBeGreaterThan(5);
  await expect(page.locator('.key[data-level="silver"], .key[data-level="gold"]')).toHaveCount(0);
});

test('"?" all the way places at the start', async ({ page }) => {
  await startNameIt(page);
  await page.getByRole('button', { name: 'Show me what you know' }).click();
  await runRound(page, 'idk');
  await expect(page.getByTestId('placement-line')).toContainText("Let's start with the first ones");
  await page.getByRole('button', { name: /Let's play/ }).click();
  await expect(page.getByText('✨ New note!')).toBeVisible();
});

test('the offer does not appear on a lane with progress', async ({ page }) => {
  await startNameIt(page);
  await page.getByRole('button', { name: 'Start from the beginning' }).click();
  await expect(page.getByText('✨ New note!')).toBeVisible();
  const letter = (await page.locator('svg.staff').getAttribute('data-note'))![0]!;
  await page.locator(`[data-answer="${letter}"]`).click();
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.getByTestId('placement-offer')).toHaveCount(0);
  await expect(page.locator('.pad__key').first()).toBeVisible();
});

test('"Start from the beginning" skips placement', async ({ page }) => {
  await startNameIt(page);
  await page.getByRole('button', { name: 'Start from the beginning' }).click();
  await expect(page.getByTestId('placement-offer')).toHaveCount(0);
  await expect(page.getByText('✨ New note!')).toBeVisible();
});

test('quitting the round leaves the lane fresh, so the offer comes back', async ({ page }) => {
  await startNameIt(page);
  await page.getByRole('button', { name: 'Show me what you know' }).click();
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  await page.locator('[data-answer="?"]').click();
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.getByTestId('placement-offer')).toBeVisible();
});

test('Letter Math offers placement too, and "?" all the way starts at the beginning', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('radio', { name: /Letter Math/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await page.getByRole('button', { name: 'Show me what you know' }).click();
  for (let i = 0; i < 20 && !(await result(page).isVisible()); i++) {
    await expect(page.locator('.pad__key:not([disabled])').first().or(result(page))).toBeVisible();
    if (await result(page).isVisible()) break;
    await page.locator('[data-answer="?"]').click();
    await expect(page.getByTestId('placement-ack').or(result(page))).toBeVisible();
  }
  await expect(page.getByTestId('placement-line')).toContainText("Let's start with the first ones");
});
