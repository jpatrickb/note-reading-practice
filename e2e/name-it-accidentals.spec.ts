import { type Page, expect, test } from '@playwright/test';
import { skipPlacement } from './skipPlacement';

// Name It with sharps and flats (issue #34): a seeded save with only one accidental open, so the question is
// known. Touch and keyboard both answer; an enharmonic spelling is wrong with the gentle wording.

const NATURALS = ['G4', 'C4', 'A4', 'F4', 'E4', 'B4', 'D4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'B3', 'A3'];
const ACCIDENTALS = ['F#4', 'Bb4', 'C#5', 'Eb5', 'G#4', 'Ab5'];
const ids = [...NATURALS, ...ACCIDENTALS].map((n) => `name:treble:${n}`);

async function seedOnly(page: Page, itemId: string) {
  await page.addInitScript(
    ([only, all]) => {
      if (localStorage.getItem('nrp:v1:state')) return;
      const items: Record<string, unknown> = {};
      for (const k of all!) items[k] = { unlocked: k === only, best: 0, m: 0, n: 0, c: 0, last: 0, rt: 0, s: 6, silverDay: -1 };
      localStorage.setItem('nrp:v1:state', JSON.stringify({ version: 1, items, rtBaseline: 0, confusions: {}, recentErrors: [], practiceDays: [], lessonsSeen: {} }));
    },
    [itemId, ids] as const,
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Treble', exact: true }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await skipPlacement(page);
  await expect(page.locator('svg.staff')).toHaveAttribute('data-note', itemId.split(':')[2]!);
}

const saved = (page: Page, itemId: string) =>
  page.evaluate((id) => {
    const it = JSON.parse(localStorage.getItem('nrp:v1:state')!).items[id];
    return { n: it.n, c: it.c };
  }, itemId);

test('F sharp is answered with the sharp modifier then F, by touch or mouse', async ({ page }) => {
  await seedOnly(page, 'name:treble:F#4');
  await expect(page.locator('.apad')).toBeVisible();
  await expect(page.locator('.kpad')).toBeHidden();
  await expect(page.locator('[data-modifier="sharp"]')).toBeVisible();
  const box = (await page.locator('[data-modifier="sharp"]').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.locator('[data-modifier="sharp"]').click();
  await page.locator('.apad .pad [data-answer="F"]').click();
  await expect.poll(() => saved(page, 'name:treble:F#4')).toEqual({ n: 1, c: 1 });
});

test('F sharp from the laptop keyboard: # then F', async ({ page }) => {
  await seedOnly(page, 'name:treble:F#4');
  await page.keyboard.press('#');
  await page.keyboard.press('f');
  await expect.poll(() => saved(page, 'name:treble:F#4')).toEqual({ n: 1, c: 1 });
});

test('the enharmonic spelling is wrong, gently, and the staff label says F♯', async ({ page }) => {
  await seedOnly(page, 'name:treble:F#4');
  await page.locator('[data-modifier="flat"]').click();
  await page.locator('.apad .pad [data-answer="G"]').click();
  await expect(page.locator('.hint')).toContainText('same key with different names');
  await expect(page.locator('.hint')).toContainText('written as F♯');
  await expect(page.locator('.staff__label')).toHaveText('F♯');
  expect(await saved(page, 'name:treble:F#4')).toEqual({ n: 1, c: 0 });
});

test('a key-finding item (C sharp) is answered on the 12-key keyboard, by the right key whatever its name', async ({ page }) => {
  await seedOnly(page, 'name:treble:C#5');
  await expect(page.locator('.kpad')).toBeVisible();
  await expect(page.locator('.apad')).toBeHidden();
  const black = page.locator('.kpad .piano__key--black');
  await expect(black).toHaveCount(5);
  for (const k of await black.all()) expect((await k.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await page.locator('.kpad .piano__key[data-midi="61"]').click(); // C♯ / D♭
  await expect.poll(() => saved(page, 'name:treble:C#5')).toEqual({ n: 1, c: 1 });
});
