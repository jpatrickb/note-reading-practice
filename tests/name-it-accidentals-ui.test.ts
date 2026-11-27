// @vitest-environment jsdom
// Name It with sharps and flats, on screen: the staff label says F♯ (not F), the mode picks the pad or the
// keyboard per item, the modifiers appear only once an accidental is unlocked, and an enharmonic answer is
// wrong with gentle "same key, different name" feedback.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { nameEngine } from '../src/core/engine';
import { ITEMS } from '../src/core/items';
import { NAME_IT_MODE, startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { nameItPlay } from '../src/ui/nameIt';
import { T0 } from './helpers';
import { renderMasteryKeyboard } from '../src/render/keyboard';

const synth = { note: vi.fn() } as unknown as Synth;

/** A session that can only ask `itemId` (every other item locked), so the test knows the question. */
async function ask(itemId: string) {
  const state = nameEngine.newStudent();
  for (const i of ITEMS) state.items[i.id]!.unlocked = i.id === itemId;
  const session = startSession(['treble'], 5, NAME_IT_MODE);
  const host = { session, state, now: () => T0, save: vi.fn(), announce: vi.fn(), muteButton: () => h('button', {}, 'mute'), quit: vi.fn(), finish: vi.fn(), stopSound: vi.fn() };
  const shell = nameItPlay(host, synth);
  document.body.append(shell.render());
  await Promise.resolve();
  return { shell, session, state };
}
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const visible = (el: Element | null) => !!el && !el.closest('[hidden]');
const click = (sel: string) => q(sel).click();

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('Name It input per item (the mode decides, the kid does not choose)', () => {
  it('a spelled item (F♯4) shows the pad with the ♯/♭ modifiers, and no style switch', async () => {
    await ask('name:treble:F#4');
    expect(visible(q('.apad'))).toBe(true);
    expect(visible(q('.kpad'))).toBe(false);
    expect(visible(q('[data-modifier="sharp"]'))).toBe(true);
    expect(visible(q('.ainput__switch'))).toBe(false);
  });

  it('a key-finding item (C♯5) shows the 12-key keyboard with dual names on the black keys', async () => {
    await ask('name:treble:C#5');
    expect(visible(q('.kpad'))).toBe(true);
    expect(visible(q('.apad'))).toBe(false);
    expect(visible(q('.ainput__switch'))).toBe(false);
    expect(q('.kpad').textContent).toContain('C♯');
    expect(q('.kpad').textContent).toContain('D♭');
  });

  it('naturals keep the plain pad: the modifiers stay hidden until a sharp or flat is unlocked', async () => {
    await ask('name:treble:G4');
    expect(visible(q('.apad'))).toBe(true);
    expect(visible(q('[data-modifier="sharp"]'))).toBe(false);
    expect(q('.apad .pad').querySelectorAll('.pad__key')).toHaveLength(8);
  });
});

describe('answering', () => {
  it('♯ then F answers F♯ on the pad, correctly, and the staff label says F♯', async () => {
    const { session } = await ask('name:treble:F#4');
    click('[data-modifier="sharp"]');
    click('.apad .pad [data-answer="F"]');
    expect(session.results.at(-1)!.outcome).toBe('correct');
    expect(q('.staff__label').textContent).toBe('F♯'); // displayName, not the bare letter
    expect(q('.staff').getAttribute('aria-label')).toContain('F sharp');
  });

  it('works from the laptop keyboard: # then F', async () => {
    const { session, shell } = await ask('name:treble:F#4');
    shell.onKey(new KeyboardEvent('keydown', { key: '#', cancelable: true }));
    shell.onKey(new KeyboardEvent('keydown', { key: 'f', cancelable: true }));
    expect(session.results.at(-1)!.outcome).toBe('correct');
  });

  it('the enharmonic spelling is wrong on the pad, with the gentle "same key" wording', async () => {
    const { session } = await ask('name:treble:F#4');
    click('[data-modifier="flat"]');
    click('.apad .pad [data-answer="G"]');
    expect(session.results.at(-1)!.outcome).toBe('wrong');
    const text = q('.hint').textContent!;
    expect(text).toContain('same key with different names');
    expect(text).toContain('written as F♯');
    expect(text).toContain('A sharp ♯ raises the note to the very next key up.');
    expect(q('.staff__label').textContent).toBe('F♯');
  });

  it('the bare letter of a sharp is wrong, and the feedback says what the note is', async () => {
    const { session } = await ask('name:treble:F#4');
    click('.apad .pad [data-answer="F"]');
    expect(session.results.at(-1)!.outcome).toBe('wrong');
    expect(q('.hint__lead').textContent).toContain('Meet F♯! (Not F.)');
  });

  it('on the keyboard the right KEY is right whichever name it carries (Bb = the A♯ key)', async () => {
    const { session } = await ask('name:treble:Eb5'); // keys item
    const key = document.querySelector<HTMLElement>('.kpad .piano__key[data-midi="63"]')!; // D♯4 / E♭4
    key.click();
    expect(session.results.at(-1)!.outcome).toBe('correct');
  });
});

describe('the mastery keyboard', () => {
  it('draws sharps and flats as decorative black keys until unlocked, then as real items with a level', async () => {
    const state = nameEngine.newStudent();
    expect(renderMasteryKeyboard(state, 'treble', T0).querySelectorAll('.key')).toHaveLength(17);
    state.items['name:treble:F#4']!.unlocked = true;
    const svg = renderMasteryKeyboard(state, 'treble', T0);
    expect(svg.querySelectorAll('.key')).toHaveLength(18);
    const black = svg.querySelector('.key--black')!;
    expect(black.getAttribute('data-item')).toBe('name:treble:F#4');
    expect(black.getAttribute('data-level')).toBe('learning');
    expect(black.querySelector('title')!.textContent).toContain('F#4');
  });
});
