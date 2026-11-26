import type { Page } from '@playwright/test';

/**
 * After tapping Start on a fresh lane the app offers the placement round. Tests that are about
 * Relies on the offer rendering synchronously in the Start click handler (`isVisible()` does not
 * wait); an async offer would make this flaky, not fail loudly. Tests about something else take "Start from the beginning" (a no-op when there is no offer).
 */
export async function skipPlacement(page: Page): Promise<void> {
  const skip = page.getByTestId('placement-skip');
  if (await skip.isVisible()) await skip.click();
}
