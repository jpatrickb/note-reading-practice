import { type Page, expect, test } from '@playwright/test';

// Illustrated worlds + game feel, and the learning-science guardrails that keep them in check:
// calm mode, reduced motion, reward size following real progress, wrong < right, and nothing moving
// over or behind the staff while a question is up.

const THEMES = ['sunny', 'ocean', 'forest', 'candy', 'space', 'studio'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const shift = (l: string, n: number) => LETTERS[(((LETTERS.indexOf(l) + n) % 7) + 7) % 7]!;

async function seed(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: true, ...s }));
      sessionStorage.setItem('seeded', '1');
    }
  }, settings);
}

async function nextNote(page: Page): Promise<string> {
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  return (await page.locator('svg.staff').getAttribute('data-note'))![0]!;
}

const fx = (page: Page) => page.locator('.fx-layer');

async function lastReaction(page: Page) {
  const layer = fx(page);
  return {
    kind: await layer.getAttribute('data-last-kind'),
    particles: Number(await layer.getAttribute('data-last-particles')),
    ms: Number(await layer.getAttribute('data-last-ms')),
  };
}

/** Running animations (CSS + Web Animations) whose element overlaps the staff card. */
function movingOverStaff(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('.staff-card')!.getBoundingClientRect();
    const hits: string[] = [];
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue;
      const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < card.right && r.right > card.left && r.top < card.bottom && r.bottom > card.top) {
        hits.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute('class'))}`);
      }
    }
    return { hits, particles: Number(document.querySelector('.fx-layer')?.getAttribute('data-active') ?? 0) };
  });
}

const runningIn = (page: Page, sel: string) =>
  page.evaluate((s) => document.getAnimations().filter((a) => a.playState === 'running' && ((a.effect as KeyframeEffect).target as Element)?.closest(s)).length, sel);

test('every theme has its own illustrated world and mascot', async ({ page }) => {
  for (const theme of THEMES) {
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: true, theme: t })), theme);
    await page.reload();
    await expect(page.locator('.world')).toHaveAttribute('data-world', theme);
    await expect(page.locator('.world__ground')).toBeVisible();
    await expect(page.locator(`.hero .mascot--${theme}`)).toBeVisible();
    // Chrome buttons use the SVG icon set, not emoji.
    await expect(page.locator('.topbar .icon-btn svg.icon')).toHaveCount(1);
  }
});

test('the selected mode / clef stands out clearly (Space)', async ({ page }) => {
  await seed(page, { theme: 'space' });
  await page.goto('/');
  const on = page.getByRole('button', { name: 'Treble', exact: true });
  const off = page.getByRole('button', { name: 'Bass', exact: true });
  await expect(on).toHaveCSS('background-color', 'rgb(116, 192, 252)');
  await expect(off).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('calm mode: the toggle persists and turns ambient motion and effects off', async ({ page, hasTouch }) => {
  await seed(page, { theme: 'ocean' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-calm', 'false');
  expect(await runningIn(page, '.world')).toBeGreaterThan(0);

  await page.getByRole('button', { name: /Theme/ }).click();
  const toggle = page.getByRole('switch', { name: 'Calm mode' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  if (hasTouch) await toggle.tap();
  else await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-calm', 'true');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-calm', 'true');
  await expect(page.getByRole('switch', { name: 'Calm mode' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Done' }).click();
  expect(await runningIn(page, '.world')).toBe(0);
  expect(await runningIn(page, '.mascot')).toBe(0);

  await page.getByRole('button', { name: /Start/ }).click();
  const l = await nextNote(page);
  await page.locator(`[data-answer="${l}"]`).click();
  await expect(page.locator('.praise')).toBeVisible();
  await expect(fx(page)).toHaveAttribute('data-last-kind', 'correct');
  expect(await lastReaction(page)).toMatchObject({ particles: 0, ms: 0 });
  // The mascot still shows it is happy, just without the hop.
  await expect(page.locator('.coach__mascot')).toHaveAttribute('data-mood', 'happy');
});

test('the OS reduced-motion setting turns calm mode on', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, { theme: 'space' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-calm', 'true');
  expect(await runningIn(page, '.world')).toBe(0);
  await page.getByRole('button', { name: /Theme/ }).click();
  const toggle = page.getByRole('switch', { name: 'Calm mode' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toBeDisabled();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  const l = await nextNote(page);
  await page.locator(`[data-answer="${l}"]`).click();
  await expect(fx(page)).toHaveAttribute('data-last-kind', 'correct');
  expect((await lastReaction(page)).particles).toBe(0);
});

test('a wrong answer gets a smaller, gentler reaction than a correct one', async ({ page }) => {
  await seed(page, { theme: 'candy' });
  await page.goto('/');
  await page.getByRole('button', { name: /Start/ }).click();

  let l = await nextNote(page);
  await page.locator(`[data-answer="${l}"]`).click();
  await expect(fx(page)).toHaveAttribute('data-last-kind', 'correct');
  const right = await lastReaction(page);
  await expect(page.locator('.coach__mascot')).toHaveAttribute('data-mood', 'happy');
  expect(right.particles).toBeGreaterThan(0);
  expect(right.particles).toBeLessThanOrEqual(20); // small: the big show is saved for new mastery
  expect(right.ms).toBeLessThan(700); // fits inside the auto-advance

  l = await nextNote(page);
  await page.locator(`[data-answer="${shift(l, 2)}"]`).click();
  await expect(fx(page)).toHaveAttribute('data-last-kind', 'wrong');
  const wrong = await lastReaction(page);
  await expect(page.locator('.coach__mascot')).toHaveAttribute('data-mood', 'encourage');
  expect(wrong.particles).toBe(0);
  expect(wrong.ms).toBeGreaterThan(0);
  expect(wrong.ms).toBeLessThan(right.ms);

  await page.getByTestId('continue').click();
  l = await nextNote(page);
  await page.locator('[data-answer="?"]').click();
  await expect(fx(page)).toHaveAttribute('data-last-kind', 'idk');
  const idk = await lastReaction(page);
  expect(idk.particles).toBe(0);
  expect(idk.ms).toBeLessThan(right.ms);
});

test('new silver mastery gets the big celebration: confetti, a flying key and a cheer', async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, { theme: 'space' });
  await page.goto('/');
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.getByTestId('trophy')).toContainText('0');
  let correct = 0;
  for (let i = 0; i < 20; i++) {
    const l = await nextNote(page);
    await page.locator(`[data-answer="${l}"]`).click();
    const r = await lastReaction(page);
    if (r.kind === 'correct') correct = Math.max(correct, r.particles);
    if (r.kind === 'silver' || r.kind === 'gold') {
      await expect(page.locator('.fly-key')).toBeVisible();
      await expect(page.locator('.coach__mascot')).toHaveAttribute('data-mood', 'cheer');
      expect(r.particles).toBeGreaterThan(3 * correct);
      expect(r.ms).toBeLessThanOrEqual(1600); // fits the existing mastery pause
      await expect(page.locator('.praise--silver, .praise--gold')).toBeVisible();
      await expect(page.getByTestId('trophy')).toContainText('1');
      return;
    }
  }
  throw new Error('no silver within a perfect session');
});

test('nothing moves over or behind the staff while a question is up (every theme)', async ({ page }) => {
  test.setTimeout(90_000);
  for (const theme of THEMES) {
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: true, theme: t })), theme);
    await page.reload();
    await page.getByRole('button', { name: /Start/ }).click();
    let l = await nextNote(page);
    await page.waitForTimeout(500);
    expect(await movingOverStaff(page), theme).toEqual({ hits: [], particles: 0 });
    // Also after a correct answer's reaction: it has to be over before the next question appears.
    await page.locator(`[data-answer="${l}"]`).click();
    l = await nextNote(page);
    await page.waitForTimeout(100);
    expect(await movingOverStaff(page), `${theme} after an answer`).toEqual({ hits: [], particles: 0 });
    // The mascot waits quietly during the question.
    await expect(page.locator('.coach__mascot')).toHaveAttribute('data-mood', 'thinking');
  }
});

test('the summary celebrates, and the journey reaches its goal', async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, { theme: 'forest' });
  await page.goto('/');
  await page.getByRole('button', { name: /Start/ }).click();
  for (let i = 0; i < 20; i++) {
    const l = await nextNote(page);
    await page.locator(`[data-answer="${l}"]`).click();
    if (i === 19) await expect(page.locator('.journey')).toHaveAttribute('aria-valuenow', '20');
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
  await expect(page.locator('.summary__mascot')).toHaveAttribute('data-mood', 'cheer');
  await expect(page.locator('.summary .chip--silver').first()).toBeVisible();
  await expect(page.locator('.summary .piano svg.keys')).toBeVisible();
});
