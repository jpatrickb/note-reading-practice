import { type Page, expect, test } from '@playwright/test';

// Letter Math: musical-alphabet questions answered on the same A–G pad as Name It.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const shift = (l: string, n: number) => LETTERS[(((LETTERS.indexOf(l) + n) % 7) + 7) % 7]!;

/** Letters moved for an item id like "lm:after:G" or "lm:up5:D". */
function steps(rung: string): number {
  if (rung === 'after') return 1;
  if (rung === 'before') return -1;
  if (rung === 'skipUp') return 2;
  if (rung === 'skipDown') return -2;
  const size = Number(rung.slice(-1));
  return rung.startsWith('up') ? size - 1 : 1 - size;
}

/** Wait for an answerable question and work out its answer. */
async function nextQuestion(page: Page): Promise<{ id: string; start: string; answer: string }> {
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  const id = (await page.getByTestId('lm-question').getAttribute('data-item'))!;
  const [, rung, start] = id.split(':') as [string, string, string];
  return { id, start, answer: shift(start, steps(rung)) };
}

async function tap(page: Page, answer: string) {
  await page.locator(`[data-answer="${answer}"]`).click();
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Letter Math/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
}

async function playPerfectSession(page: Page) {
  test.setTimeout(90_000);
  for (let i = 0; i < 20; i++) {
    const { answer } = await nextQuestion(page);
    await tap(page, answer);
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
}

test('the home screen offers Letter Math and remembers the choice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Name It/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Letter Math/ }).click();
  await expect(page.getByRole('button', { name: 'Treble', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /Letter Math/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Name It/ }).click();
  await expect(page.getByRole('button', { name: 'Treble', exact: true })).toBeVisible();
});

test('asks an alphabet question with no staff, and a right answer moves on by itself', async ({ page }) => {
  await start(page);
  const q = await nextQuestion(page);
  await expect(page.locator('svg.staff')).toHaveCount(0);
  await expect(page.locator('.lm-prompt')).toContainText('What comes after');
  await expect(page.locator('.lm-letter')).toHaveText(q.start);
  await expect(page.getByText('✨ New question!')).toBeVisible();
  await tap(page, q.answer);
  await expect(page.locator('.praise')).toBeVisible();
  await expect(page.locator(`[data-answer="${q.answer}"]`)).toHaveClass(/pad__key--right/);
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await expect.poll(async () => (await nextQuestion(page)).id).not.toBe(q.id);
});

test('a wrong answer shows the letter walk and waits for "Got it"', async ({ page }) => {
  await start(page);
  const q = await nextQuestion(page);
  const wrong = shift(q.answer, 3);
  await tap(page, wrong);
  await expect(page.locator('.hint__lead')).toContainText(`(Not ${wrong}.) After ${q.start} comes ${q.answer}.`);
  await expect(page.locator('.lm-step--start')).toHaveText(q.start);
  await expect(page.locator('.lm-step--end')).toHaveText(q.answer);
  await expect(page.locator(`[data-answer="${wrong}"]`)).toHaveClass(/pad__key--wrong/);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.getByTestId('continue').click();
  await nextQuestion(page);
});

test('"?" teaches kindly', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 12; i++) {
    const q = await nextQuestion(page);
    if (await page.locator('.badge').isVisible()) {
      await tap(page, '?');
      await expect(page.locator('.hint__lead')).toContainText(`Here's a new one! After ${q.start} comes ${q.answer}.`);
      await page.getByTestId('continue').click();
      continue;
    }
    await tap(page, '?');
    await expect(page.locator('.hint__lead')).toHaveText(`After ${q.start} comes ${q.answer}. Thanks for being honest!`);
    return;
  }
  throw new Error('never saw a repeated question');
});

test('the first questions do not all share one answer letter', async ({ page }) => {
  await start(page);
  const answers: string[] = [];
  for (let i = 0; i < 8; i++) {
    const { answer } = await nextQuestion(page);
    answers.push(answer);
    await tap(page, answer);
  }
  const most = Math.max(...answers.map((l) => answers.filter((x) => x === l).length));
  expect(most, answers.join('')).toBeLessThanOrEqual(4);
});

test('opening several questions at once shows one unlock toast, not one per question', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  // Record every unlock toast as it appears (they fade after a few seconds).
  await page.evaluate(() => {
    const w = window as unknown as { unlockToasts: string[] };
    w.unlockToasts = [];
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n instanceof HTMLElement && n.classList.contains('toast--unlock')) w.unlockToasts.push(n.textContent ?? '');
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const toasts = () => page.evaluate(() => (window as unknown as { unlockToasts: string[] }).unlockToasts.length);
  for (let i = 0; i < 20; i++) {
    const { answer } = await nextQuestion(page);
    const before = await toasts();
    await tap(page, answer);
    if (i < 19) await nextQuestion(page);
    expect((await toasts()) - before, `answer ${i + 1}`).toBeLessThanOrEqual(1);
  }
  const texts = await page.evaluate(() => (window as unknown as { unlockToasts: string[] }).unlockToasts);
  // A perfect first session opens a whole rung at once at least once.
  expect(texts.some((t) => /🔓 [2-9] new questions are coming up!/.test(t)), texts.join(' | ')).toBe(true);
});

test('a perfect session earns silver, shows the Letter Math grid, and persists', async ({ page }) => {
  await start(page);
  await playPerfectSession(page);
  await expect(page.locator('.summary [data-testid=letter-map] .lm-cell[data-level="silver"]').first()).toBeVisible();
  await expect(page.getByText(/New silver/)).toBeVisible();
  await expect(page.getByTestId('weekly-goal')).toContainText('1 of 4 days');

  await page.reload();
  await page.getByRole('button', { name: /My keyboard/ }).click();
  const map = page.getByTestId('letter-map');
  await expect(map).toContainText('Next letter up');
  expect(await map.locator('.lm-cell[data-level="silver"]').count()).toBeGreaterThan(0);
  // Name It progress is untouched.
  expect(await page.locator('.key[data-level="silver"]').count()).toBe(0);
});

test('Letter Math progress moves to another device in the progress code', async ({ page, browser, baseURL }) => {
  await start(page);
  await playPerfectSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Save/ }).click();
  const code = await page.getByTestId('progress-code').inputValue();
  const silver = await page.evaluate(() => JSON.parse(localStorage.getItem('nrp:v1:state:letters')!)).then(
    (s: { items: Record<string, { best: number }> }) => Object.values(s.items).filter((i) => i.best === 1).length,
  );
  expect(silver).toBeGreaterThan(0);

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.goto(`${baseURL}/#import=${code}`);
  await expect(page2.getByText(`Letter Math: 🥇 0 gold and 🥈 ${silver} silver.`)).toBeVisible();
  await page2.getByTestId('confirm-import').click();
  await page2.getByRole('button', { name: /My keyboard/ }).click();
  await expect(page2.locator('[data-testid=letter-map] .lm-cell[data-level="silver"]')).toHaveCount(silver);
  await other.close();
});

test('desktop: type letters, "?" and Enter in Letter Math', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard input is a desktop feature');
  await start(page);
  const q = await nextQuestion(page);
  await page.keyboard.press(shift(q.answer, 2).toLowerCase());
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.keyboard.press('Enter');
  const next = await nextQuestion(page);
  await page.keyboard.press(next.answer.toLowerCase());
  await expect(page.locator('.praise')).toBeVisible();
});

test('quitting Letter Math returns home', async ({ page }) => {
  await start(page);
  await nextQuestion(page);
  await page.getByRole('button', { name: 'Stop and go home' }).click();
  await expect(page.getByRole('button', { name: /Start/ })).toBeVisible();
});

test('Letter Math touch targets are at least 44px', async ({ page }) => {
  await start(page);
  const q = await nextQuestion(page);
  await tap(page, shift(q.answer, 1));
  for (const box of await page.locator('.pad__key, .icon-btn, .lm-step').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
