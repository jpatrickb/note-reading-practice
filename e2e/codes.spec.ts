import { expect, test } from '@playwright/test';
import { GOLDEN_CODES } from '../tests/fixtures/codes';

// Progress codes saved by earlier builds (v1/v2) must keep loading in the real app.

for (const key of ['v1Played', 'v2Played', 'v2Full'] as const) {
  test(`a ${key} code from an earlier build still loads`, async ({ page }) => {
    const g = GOLDEN_CODES[key]!;
    const gold = Object.values(g.expected.name.items).filter((i) => i.best === 2).length;
    const silver = Object.values(g.expected.name.items).filter((i) => i.best === 1).length;
    await page.goto(`/#import=${g.code}`);
    await expect(page.getByText(`Name It: 🥇 ${gold} gold and 🥈 ${silver} silver`)).toBeVisible();
    await expect(page.getByTestId('import-error')).toHaveCount(0);
    await page.getByTestId('confirm-import').click();
    await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
  });
}
