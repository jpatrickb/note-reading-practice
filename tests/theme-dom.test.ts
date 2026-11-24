// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/storage';
import { getTheme } from '../src/core/themes';
import { applyTheme, bootTheme } from '../src/ui/theme';
import { renderThemePicker } from '../src/ui/themePicker';

const root = () => document.documentElement;
const meta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

beforeEach(() => {
  root().removeAttribute('style');
  root().removeAttribute('data-theme');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('applyTheme', () => {
  it('sets tokens, data-theme, color-scheme and creates theme-color', () => {
    applyTheme(getTheme('space'));
    expect(root().dataset.theme).toBe('space');
    expect(root().style.getPropertyValue('--bg')).toBe('#0f1226');
    expect(root().style.colorScheme).toBe('dark');
    expect(meta()!.content).toBe('#0f1226');
  });

  it('updates an existing theme-color meta instead of adding another', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fff8ec">';
    applyTheme(getTheme('ocean'));
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(meta()!.content).toBe(getTheme('ocean').colors.bg);
    expect(root().style.colorScheme).toBe('light');
  });
});

describe('bootTheme', () => {
  it('applies the saved theme', () => {
    const store = { getItem: () => JSON.stringify({ theme: 'candy' }), setItem() {}, removeItem() {} };
    expect(bootTheme(store).id).toBe('candy');
    expect(root().dataset.theme).toBe('candy');
  });

  it('uses the default theme when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem() {},
      removeItem() {},
    };
    expect(bootTheme(blocked).id).toBe('sunny');
  });

  it('reads localStorage by default', () => {
    localStorage.setItem('nrp:v1:settings', JSON.stringify({ theme: 'studio' }));
    expect(bootTheme().id).toBe('studio');
    localStorage.clear();
  });
});

describe('theme picker', () => {
  function setup(theme?: Settings['theme']) {
    const settings: Settings = { ...DEFAULT_SETTINGS, theme };
    let saves = 0;
    let done = 0;
    const el = renderThemePicker({ settings, save: () => saves++, onDone: () => done++ });
    document.body.append(el);
    const radios = [...el.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    return { settings, el, radios, saves: () => saves, done: () => done };
  }

  it('shows one radio per theme with the current one checked and focusable', () => {
    const { radios } = setup('forest');
    expect(radios).toHaveLength(6);
    const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked.map((r) => r.dataset.themeId)).toEqual(['forest']);
    expect(radios.map((r) => r.tabIndex)).toEqual(radios.map((r) => (r.dataset.themeId === 'forest' ? 0 : -1)));
  });

  it('previews each theme in its own colors', () => {
    const { radios } = setup();
    const space = radios.find((r) => r.dataset.themeId === 'space')!;
    expect(space.querySelector<HTMLElement>('.theme-preview')!.style.getPropertyValue('--bg')).toBe('#0f1226');
    expect(space.querySelector('svg .staff__note')).not.toBeNull();
  });

  it('clicking a theme applies and saves it', () => {
    const t = setup();
    t.radios.find((r) => r.dataset.themeId === 'ocean')!.click();
    expect(t.settings.theme).toBe('ocean');
    expect(t.saves()).toBe(1);
    expect(root().dataset.theme).toBe('ocean');
    expect(t.radios.find((r) => r.dataset.themeId === 'ocean')!.getAttribute('aria-checked')).toBe('true');
  });

  it('arrow keys, Home and End move the selection and focus (wrapping around)', () => {
    const t = setup('sunny');
    const key = (k: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    t.radios[0]!.focus();
    key('ArrowRight');
    expect(t.settings.theme).toBe('ocean');
    expect(document.activeElement).toBe(t.radios[1]);
    key('ArrowLeft');
    key('ArrowUp');
    expect(t.settings.theme).toBe('studio'); // wrapped to the last
    key('Home');
    expect(t.settings.theme).toBe('sunny');
    key('End');
    expect(document.activeElement).toBe(t.radios[5]);
    key('x'); // ignored
    expect(t.settings.theme).toBe('studio');
  });

  it('Back and Done both leave the picker', () => {
    const t = setup();
    t.el.querySelector<HTMLButtonElement>('[aria-label=Back]')!.click();
    [...t.el.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    expect(t.done()).toBe(2);
  });
});
