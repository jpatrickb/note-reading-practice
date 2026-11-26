import { type Page, expect, test } from '@playwright/test';
import { skipPlacement } from './skipPlacement';

// Note Catcher: a note on the staff, tap its exact key on the on-screen piano.

const piano = (page: Page) => page.locator('.piano');
const key = (page: Page, note: string) => piano(page).locator(`[data-note="${note}"]`);

async function start(page: Page, clef?: 'Treble' | 'Bass') {
  await page.goto('/');
  await page.getByRole('radio', { name: /Note Catcher/ }).click();
  if (clef) await page.getByRole('button', { name: clef, exact: true }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await skipPlacement(page); // a no-op: Note Catcher offers no placement round
}

/** Wait for an answerable question; its note is on the staff's data-note. */
async function shownNote(page: Page): Promise<string> {
  await expect(page.locator('.piano__key[aria-disabled="true"]')).toHaveCount(0);
  await expect(page.locator('.staff')).toBeVisible();
  return (await page.locator('.staff').getAttribute('data-note'))!;
}

test('the home screen offers Note Catcher under Find keys', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find keys' })).toBeVisible();
  await expect(page.locator('.mode-card[data-mode="catch"]')).toContainText('See the note, tap the key');
});

test('a perfect session: tap the key for each note shown', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  for (let i = 0; i < 20; i++) {
    const note = await shownNote(page);
    await key(page, note).click();
  }
  await expect(page.getByTestId('score')).toHaveText('20 of 20 right', { timeout: 5000 });
});

test('the piano gives nothing away during a question', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  await expect(piano(page).locator('.piano__label')).toHaveCount(0);
  await expect(piano(page).locator('.piano__dot')).toHaveCount(1); // the one anchor: middle C
  await expect(key(page, 'C4').locator('.piano__dot')).toHaveCount(1);
  const labels = await piano(page)
    .locator('.piano__key')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  for (const l of labels) expect(l).toMatch(/^(Piano key \d+ of \d+(, middle C)?|Black key after white key \d+)$/);
  await expect(page.locator('.staff')).not.toHaveAttribute('aria-label', /the note/);
  // After the answer, the keys are named again.
  await key(page, note).click();
  await expect(key(page, note)).toHaveAttribute('aria-label', new RegExp(`^${note}`));
  await expect(piano(page).locator('.piano__dot')).toHaveCount(1);
});

test('treble and bass questions use the same keyboard: the key count never changes', async ({ page }) => {
  const counts: number[] = [];
  for (const clef of ['Treble', 'Bass'] as const) {
    await start(page, clef);
    await shownNote(page);
    counts.push(await piano(page).locator('.piano__key').count());
    expect(await page.locator('.staff').getAttribute('data-clef')).toBe(clef.toLowerCase());
    await expect(piano(page).locator('.piano__key--white')).toHaveCount(29); // C2 to C6
  }
  expect(counts[0]).toBe(counts[1]);
});

test('every question starts with middle C centered, and C4 is never asked', async ({ page }) => {
  test.setTimeout(60_000);
  await start(page);
  for (let i = 0; i < 8; i++) {
    const note = await shownNote(page);
    expect(note).not.toBe('C4');
    await expect(key(page, 'C4')).toContainText('Middle C');
    const p = (await piano(page).boundingBox())!;
    const c = (await key(page, 'C4').boundingBox())!;
    expect(Math.abs(c.x + c.width / 2 - (p.x + p.width / 2)), `question ${i}`).toBeLessThan(4);
    await key(page, note).click(); // scrolls the keys; the next question must start centered again
    await expect(page.getByTestId('score').or(page.locator('.piano__key--right'))).toBeVisible();
    await expect(page.locator('.piano__key[aria-disabled="true"]')).toHaveCount(0, { timeout: 4000 });
  }
});

test('a swipe across the keys does not answer, but a tap does', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  const target = key(page, note);
  const b = (await target.boundingBox())!;
  const touch = (type: string, x: number) =>
    target.evaluate(
      (el, a) => {
        const e = new PointerEvent(a.type, { bubbles: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: a.x, clientY: 40 });
        (a.type === 'pointerup' ? document : el).dispatchEvent(e);
      },
      { type, x },
    );
  await touch('pointerdown', b.x + 10);
  await touch('pointermove', b.x + 90);
  await touch('pointerup', b.x + 90);
  await expect(page.locator('.piano__key[data-mark]')).toHaveCount(0);
  await expect(page.getByTestId('score')).toHaveCount(0);
  await touch('pointerdown', b.x + 10);
  await touch('pointerup', b.x + 10);
  await expect(page.locator('.piano__key--right')).toHaveCount(1);
});

test('the right letter in the wrong octave is wrong, kindly, and shows the right key', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  const slip = `${note[0]}${Number(note.slice(1)) + 1}`;
  await key(page, slip).click();
  await expect(page.locator('.hint__lead')).toContainText("That's the right letter, but one octave too high.");
  await expect(key(page, slip)).toHaveAttribute('data-mark', 'wrong');
  await expect(key(page, note)).toHaveAttribute('data-mark', 'target');
  await page.getByTestId('continue').click();
  await shownNote(page);
});

test('a black key is not an answer: a gentle tip, nothing scored, tap again', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  await piano(page).locator('.piano__key--black').first().click();
  await expect(page.getByTestId('catcher-tip')).toContainText("That's a black key.");
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await expect(page.locator('.piano__key[data-mark]')).toHaveCount(0);
  await key(page, note).click();
  await expect(page.locator('.piano__key--right')).toHaveCount(1);
});

test('"?" marks the key, explains, and waits for Got it', async ({ page }) => {
  await start(page);
  const note = await shownNote(page);
  await page.locator('[data-answer="?"]').click();
  await expect(key(page, note)).toHaveAttribute('data-mark', 'target');
  await expect(page.locator('.hint__lead')).toContainText('This note is');
  await page.getByTestId('continue').click();
  await shownNote(page);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 760 }, hasTouch: true });

  test('the keyboard scrolls sideways, keys stay at least 44px, and middle C starts centered', async ({ page }) => {
    await start(page);
    const note = await shownNote(page);
    await expect(piano(page).locator('.piano__key--white')).toHaveCount(29);
    const box = (await piano(page).locator('.piano__key--white').first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    const scroll = await piano(page).locator('.piano__scroller').evaluate((el) => ({ w: el.scrollWidth, c: el.clientWidth }));
    expect(scroll.w).toBeGreaterThan(scroll.c);
    const p = (await piano(page).boundingBox())!;
    const c = (await key(page, 'C4').boundingBox())!;
    expect(Math.abs(c.x + c.width / 2 - (p.x + p.width / 2))).toBeLessThan(4);
    await key(page, note).tap();
    await expect(page.locator('.piano__key--right')).toHaveCount(1);
  });

  test('a miss scrolls so the tapped key and the right key are both in view', async ({ page }) => {
    await start(page);
    const note = await shownNote(page);
    // A wrong white key 5 keys away (they fit on a phone together), tapped after scrolling there by hand.
    const whites = await piano(page).locator('.piano__key--white').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.note!));
    const at = whites.indexOf(note);
    const slip = whites[at + 5] ?? whites[at - 5]!;
    await key(page, slip).scrollIntoViewIfNeeded();
    // Let the smooth scroll finish: a tap that lands on a moving keyboard is (rightly) not an answer.
    let last = -1;
    await expect
      .poll(async () => {
        const now = await piano(page).locator('.piano__scroller').evaluate((el) => el.scrollLeft);
        const still = now === last;
        last = now;
        return still;
      })
      .toBe(true);
    await key(page, slip).tap();
    await expect(key(page, note)).toHaveAttribute('data-mark', 'target');
    await expect
      .poll(async () => {
        const p = (await piano(page).boundingBox())!;
        const inView = async (n: string) => {
          const b = (await key(page, n).boundingBox())!;
          return b.x >= p.x - 1 && b.x + b.width <= p.x + p.width + 1;
        };
        return (await inView(note)) && (await inView(slip));
      })
      .toBe(true);
  });

  test('edge chevrons show where there are more keys, are 44px or more, and scroll an octave', async ({ page }) => {
    await start(page);
    await shownNote(page);
    const left = page.getByRole('button', { name: 'Show keys to the left' });
    const right = page.getByRole('button', { name: 'Show keys to the right' });
    await expect(left).toBeVisible(); // centered on middle C: more keys both ways
    await expect(right).toBeVisible();
    const box = (await right.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    const before = await piano(page).locator('.piano__scroller').evaluate((el) => el.scrollLeft);
    await right.tap();
    await expect.poll(() => piano(page).locator('.piano__scroller').evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 200);
    await expect(page.locator('.piano__key[data-mark]')).toHaveCount(0); // a chevron tap is never an answer
  });

  test('at 320px keys are still 44px wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await start(page);
    await shownNote(page);
    const box = (await piano(page).locator('.piano__key--white').first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
  });
});
