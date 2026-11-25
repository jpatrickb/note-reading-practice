import { type Page, expect, test } from '@playwright/test';

// Word Decoder: a phrase of notes spells a word; the kid names each note in turn. Needs Name It
// progress first, so these tests seed a made-up Name It learner model with silver treble notes.

const SILVER_TREBLE = ['G4', 'C4', 'A4', 'F4', 'E4', 'B4', 'D4', 'C5', 'D5']; // 9 silver notes
const card = (page: Page, mode: string) => page.locator(`.mode-card[data-mode="${mode}"]`);

async function seed(page: Page, silver: string[]) {
  await page.addInitScript((ids) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const rec = { unlocked: true, m: 2, s: 80, n: 8, c: 8, last: Date.now() - 3_600_000, rt: 1500, best: 1, silverDay: 1 };
    const items = Object.fromEntries(ids.map((id) => [`name:treble:${id}`, rec]));
    localStorage.setItem('nrp:v1:state', JSON.stringify({ version: 1, items, rtBaseline: 1500, confusions: {}, recentErrors: [], practiceDays: [], lessonsSeen: {} }));
    localStorage.setItem('nrp:v1:settings', JSON.stringify({ clefs: ['treble'], muted: true, mode: 'words' }));
  }, silver);
}

async function start(page: Page) {
  await page.goto('/');
  await card(page, 'words').click();
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.getByTestId('wd-question')).toBeVisible();
}

/** The word on screen, from the question's item id (word:treble:CAB). */
async function currentWord(page: Page): Promise<string> {
  await expect(page.locator('.pad__key:not([disabled])').first()).toBeVisible();
  const id = (await page.getByTestId('wd-question').getAttribute('data-item'))!;
  return id.split(':')[2]!;
}

const tap = (page: Page, letter: string) => page.locator(`[data-answer="${letter}"]`).click();
const wrongFor = (l: string) => (l === 'A' ? 'B' : 'A');

test('is locked with a reason until Name It has a few silver notes', async ({ page }) => {
  await page.goto('/');
  await expect(card(page, 'words')).toContainText('Learn a few more notes in Name It first!');
  await expect(card(page, 'words')).toHaveAttribute('aria-disabled', 'true');
});

test('is offered once there are silver notes', async ({ page }) => {
  await seed(page, SILVER_TREBLE);
  await page.goto('/');
  await expect(card(page, 'words')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(card(page, 'words')).toContainText('Read the notes, spell a word');
});

test('decoding a word: the cursor moves along, the blanks fill, and the word is revealed', async ({ page }) => {
  await seed(page, SILVER_TREBLE);
  await start(page);
  const word = await currentWord(page);
  await expect(page.locator('.staff-seq__group')).toHaveCount(word.length);
  await expect(page.locator('.staff-seq__label')).toHaveCount(0);
  for (let i = 0; i < word.length; i++) {
    await expect(page.locator('.staff-seq__group--cursor')).toHaveAttribute('data-index', String(i));
    await tap(page, word[i]!);
    if (i < word.length - 1) await expect(page.locator('.wd-blank').nth(i)).toHaveText(word[i]!);
  }
  await expect(page.getByTestId('wd-reveal')).toHaveText(`🔓 ${word}!`);
  await expect(page.locator('.staff-seq__mark--right')).toHaveCount(word.length);
  await expect(page.locator('.staff-seq__label')).toHaveCount(word.length);
  await expect(page.locator('.praise')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

test('a wrong note shows its hint and waits for Got it; the word is then shown plainly', async ({ page }) => {
  await seed(page, SILVER_TREBLE);
  await start(page);
  const word = await currentWord(page);
  await tap(page, wrongFor(word[0]!));
  const hint = page.getByTestId('wd-hint');
  await expect(hint).toContainText(`That note is ${word[0]}, not ${wrongFor(word[0]!)}.`);
  await expect(hint).toContainText('This note is on');
  await expect(hint).toContainText('Count');
  await expect(page.locator('.staff-seq__mark--wrong')).toHaveCount(1);
  await expect(page.locator('.wd-blank').first()).toHaveText(word[0]!); // the right letter is filled in
  await page.waitForTimeout(1500);
  await expect(hint).toBeVisible(); // it waits
  await page.getByTestId('note-continue').click();
  await expect(hint).toHaveCount(0);
  for (let i = 1; i < word.length; i++) await tap(page, word[i]!);
  await expect(page.getByTestId('wd-reveal')).toHaveText(`The word is ${word}.`);
  await expect(page.locator('.praise')).toHaveCount(0);
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('wd-question')).toHaveAttribute('data-item', /word:treble:/);
});

test('"?" reveals the note with its hint, and the keyboard works', async ({ page }) => {
  await seed(page, SILVER_TREBLE);
  await start(page);
  const word = await currentWord(page);
  await page.keyboard.press('?');
  await expect(page.getByTestId('wd-hint')).toContainText(`That note is ${word[0]}.`);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('wd-hint')).toHaveCount(0);
  await page.keyboard.press(word[1]!.toLowerCase());
  await expect(page.locator('.wd-blank').nth(1)).toHaveText(word[1]!);
});
