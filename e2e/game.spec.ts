import { type Page, expect, test } from '@playwright/test';
import { skipPlacement } from './skipPlacement';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const shift = (l: string, n: number) => LETTERS[(((LETTERS.indexOf(l) + n) % 7) + 7) % 7]!;

/** Wait for an answerable question. */
async function nextNote(page: Page): Promise<{ letter: string; clef: string }> {
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  const staff = page.locator('svg.staff');
  return { letter: (await staff.getAttribute('data-note'))![0]!, clef: (await staff.getAttribute('data-clef'))! };
}

async function tap(page: Page, answer: string) {
  await page.locator(`[data-answer="${answer}"]`).click();
}

async function start(page: Page, clef: 'Treble' | 'Bass' | 'Both' = 'Treble') {
  await page.goto('/');
  await page.getByRole('button', { name: clef, exact: true }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await skipPlacement(page);
}

/** A full session takes ~15–20 s by design (pauses after correct answers), so allow more time. */
async function playPerfectSession(page: Page) {
  test.setTimeout(90_000);
  for (let i = 0; i < 20; i++) {
    const { letter } = await nextNote(page);
    await tap(page, letter);
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
}

test('home screen remembers the chosen clef', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Note Reader/ })).toBeVisible();
  await page.getByRole('button', { name: 'Bass', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a new note is quizzed right away, and "?" teaches it', async ({ page }) => {
  await start(page);
  await expect(page.getByText('✨ New note!')).toBeVisible();
  const { letter } = await nextNote(page);
  await tap(page, '?');
  await expect(page.locator('.hint')).toContainText(`Meet ${letter}!`);
  await expect(page.locator('svg.staff .staff__label')).toHaveText(letter);
});

test('the first questions do not all share one answer letter', async ({ page }) => {
  await start(page, 'Both');
  const letters: string[] = [];
  for (let i = 0; i < 8; i++) {
    const { letter } = await nextNote(page);
    letters.push(letter);
    await tap(page, letter);
  }
  const most = Math.max(...letters.map((l) => letters.filter((x) => x === l).length));
  expect(most, letters.join('')).toBeLessThanOrEqual(4);
});

test('a perfect session ends on the summary, earns silver, and persists', async ({ page }) => {
  await start(page);
  await playPerfectSession(page);
  await expect(page.locator('.summary .key[data-level="silver"]').first()).toBeVisible();
  await expect(page.getByTestId('weekly-goal')).toContainText('1 of 4 days');

  await page.reload();
  await page.getByRole('button', { name: /My progress/ }).click();
  expect(await page.locator('.key[data-level="silver"]').count()).toBeGreaterThan(0);
});

test('a wrong answer explains and waits for the kid', async ({ page }) => {
  await start(page);
  const { letter } = await nextNote(page);
  const wrong = shift(letter, 3);
  await tap(page, wrong);
  await expect(page.getByText(`Meet ${letter}! (Not ${wrong}.)`)).toBeVisible();
  await expect(page.locator('.hint')).toContainText('🧭');
  await expect(page.locator(`[data-answer="${letter}"]`)).toHaveClass(/pad__key--right/);
  await expect(page.locator(`[data-answer="${wrong}"]`)).toHaveClass(/pad__key--wrong/);
  await expect(page.locator('svg.staff .staff__label')).toHaveText(letter);
  // Does not auto-advance.
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.getByTestId('continue').click();
  await nextNote(page);
});

test('"?" on a note seen before reveals the answer kindly', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 12; i++) {
    const { letter } = await nextNote(page);
    if (await page.locator('.badge').isVisible()) {
      await tap(page, letter); // new note: answer it, keep going
      continue;
    }
    await tap(page, '?');
    await expect(page.getByText(`That one is ${letter}. Thanks for being honest!`)).toBeVisible();
    return;
  }
  throw new Error('never saw a repeated note');
});

test('reading bass clef like treble triggers a mini-lesson', async ({ page }) => {
  await start(page, 'Bass');
  let shown = false;
  for (let i = 0; i < 12 && !shown; i++) {
    const { letter } = await nextNote(page);
    await tap(page, shift(letter, -2)); // the treble-clef reading of this position
    await page.getByTestId('continue').click();
    shown = await page.getByTestId('lesson').isVisible();
  }
  expect(shown).toBe(true);
  await expect(page.getByTestId('lesson')).toContainText('Bass clef reads differently');
  await page.getByTestId('continue').click();
  await nextNote(page);
});

test('the quit button returns home', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
});

test('progress moves to another device with a progress code link', async ({ page, browser, baseURL }) => {
  await start(page);
  await playPerfectSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.locator('.qr svg')).toBeVisible();
  const code = await page.getByTestId('progress-code').inputValue();
  const silver = await page.evaluate(() => JSON.parse(localStorage.getItem('nrp:v1:state')!)).then(
    (s: { items: Record<string, { best: number }> }) => Object.values(s.items).filter((i) => i.best === 1).length,
  );

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.goto(`${baseURL}/#import=${code}`);
  await expect(page2.getByText(`🥈 ${silver} silver`)).toBeVisible();
  await page2.getByTestId('confirm-import').click();
  await page2.getByRole('button', { name: /My progress/ }).click();
  await expect(page2.locator('.key[data-level="silver"]')).toHaveCount(silver);
  await other.close();
});

test('a bad progress code shows a friendly error', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Save/ }).click();
  await page.getByLabel('Progress code to load').fill('AQAMUS0AAAEa4AcAAAEVKQ');
  await page.getByRole('button', { name: 'Load…' }).click();
  await expect(page.getByTestId('import-error')).toBeVisible();
});

test('desktop: kids can type letters and use Enter to continue', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard input is a desktop feature');
  await start(page);
  const { letter } = await nextNote(page);
  await page.keyboard.press(shift(letter, 1).toLowerCase());
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.keyboard.press('Enter');
  const next = await nextNote(page);
  await page.keyboard.press(next.letter.toLowerCase());
  await expect(page.locator('.praise')).toBeVisible();
});

test('touch targets are at least 44px', async ({ page }) => {
  await start(page);
  await nextNote(page);
  for (const box of await page.locator('.pad__key, .icon-btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

// ───────────── two ledger lines (#24) ─────────────

test('the mastery map shows 17 keys per clef, locked ones dashed', async ({ page }) => {
  // My progress only lists modes with progress (#20), so play one Name It question first.
  await start(page, 'Both');
  const { letter } = await nextNote(page);
  await tap(page, letter);
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  await page.getByRole('button', { name: /My progress/ }).click();
  const keys = page.locator('svg.keys');
  await expect(keys).toHaveCount(2);
  for (const svg of await keys.all()) {
    await expect(svg.locator('.key')).toHaveCount(17);
    expect(await svg.locator('.key--locked').count()).toBeGreaterThan(0);
    const box = (await svg.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await expect(page.locator('.key--locked .key__body').first()).toHaveCSS('stroke-dasharray', /\d/);
});

for (const [clef, note] of [
  ['Treble', 'C6'],
  ['Treble', 'A3'],
  ['Bass', 'E4'],
  ['Bass', 'C2'],
] as const) {
  test(`a seeded ${clef.toLowerCase()} ${note} (two ledger lines) renders and answers correctly`, async ({ page }) => {
    const id = `name:${clef.toLowerCase()}:${note}`;
    // Every note saved, all locked (so the engine adds no starters) except the one under test.
    const all = ['G4','C4','A4','F4','E4','B4','D4','C5','D5','E5','F5','G5','A5','B5','C6','B3','A3'].map((n) => `name:treble:${n}`)
      .concat(['F3','G3','E3','A3','D3','C3','B2','G2','A2','C4','B3','F2','E2','D4','E4','D2','C2'].map((n) => `name:bass:${n}`));
    await page.addInitScript(([itemId, ids]) => {
      if (localStorage.getItem('nrp:v1:state')) return;
      const items: Record<string, unknown> = {};
      for (const k of ids!) items[k] = { unlocked: k === itemId, best: 0, m: 0, n: 0, c: 0, last: 0, rt: 0, s: 6, silverDay: -1 };
      localStorage.setItem('nrp:v1:state', JSON.stringify({ version: 1, items, rtBaseline: 0, confusions: {}, recentErrors: [], practiceDays: [], lessonsSeen: {} }));
    }, [id, all] as const);
    await start(page, clef);
    const staff = page.locator('svg.staff');
    await expect(staff).toHaveAttribute('data-note', note);
    // The note and every ledger line sit inside the staff's viewBox.
    const frame = (await staff.boundingBox())!;
    const boxes = await staff.locator('.staff__note, .staff__ledger').evaluateAll((els) =>
      els.map((e) => {
        const b = e.getBoundingClientRect();
        return [b.left, b.top, b.right, b.bottom];
      }),
    );
    const tol = 0.5;
    for (const box of boxes) {
      expect(box[0]).toBeGreaterThanOrEqual(frame.x - tol);
      expect(box[1]).toBeGreaterThanOrEqual(frame.y - tol);
      expect(box[2]).toBeLessThanOrEqual(frame.x + frame.width + tol);
      expect(box[3]).toBeLessThanOrEqual(frame.y + frame.height + tol);
    }
    await expect(staff.locator('.staff__ledger')).toHaveCount(2);
    await tap(page, note[0]!);
    // The correct reaction is gone within 700 ms, so check what it saved instead.
    await expect
      .poll(() =>
        page.evaluate((itemId) => {
          const it = JSON.parse(localStorage.getItem('nrp:v1:state')!).items[itemId];
          return it.n > 0 && it.c === it.n;
        }, id),
      )
      .toBe(true);
  });
}
