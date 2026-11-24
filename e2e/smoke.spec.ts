// Smoke tests run against the live site after each deploy (`--grep @smoke`). Keep them fast and
// read-only apart from the visitor's own browser storage.
import { expect, test } from '@playwright/test';

test('@smoke home loads and a question can be answered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Note Reader/ })).toBeVisible();
  await page.getByRole('button', { name: /Start/ }).click();
  const staff = page.locator('svg.staff');
  await expect(staff).toBeVisible();
  const letter = (await staff.getAttribute('data-note'))![0]!;
  await page.locator(`[data-answer="${letter}"]`).click();
  await expect(page.locator('.praise')).toBeVisible();
});

test('@smoke save screen renders a QR progress code', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.locator('.qr svg')).toBeVisible();
});

test('@smoke security headers are served', async ({ request }) => {
  test.skip(!process.env.E2E_BASE_URL, 'headers come from Cloudflare Pages, not the local preview');
  const res = await request.get('/');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});
