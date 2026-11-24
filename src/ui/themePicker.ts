// The theme picker screen: one big card per theme with a live mini-preview drawn in that theme's
// own colors. Picking applies the theme to the whole app immediately and saves it.
// Keyboard: a radio group (Tab in, arrow keys / Home / End to move and pick); touch: tap a card.

import type { Settings } from '../core/storage';
import { THEMES, type Theme, getTheme, themeVars } from '../core/themes';
import { GLYPHS } from '../render/glyphs';
import { h } from './dom';
import { applyTheme } from './theme';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** A tiny staff with a treble clef and one note, plus a gold, silver and learning key. */
function miniScene(): SVGSVGElement {
  const s = svg('svg', { viewBox: '0 0 160 60', class: 'theme-preview__scene', 'aria-hidden': 'true' });
  const sp = 7;
  const bottom = 42;
  for (let i = 0; i < 5; i++) s.append(svg('line', { x1: 4, x2: 104, y1: bottom - i * sp, y2: bottom - i * sp, class: 'staff__line' }));
  const k = sp / 250;
  s.append(svg('path', { d: GLYPHS.gClef.path, transform: `translate(9 ${bottom - sp}) scale(${k} ${-k})`, class: 'staff__clef' }));
  s.append(svg('path', { d: GLYPHS.noteheadWhole.path, transform: `translate(62 ${bottom - 1.5 * sp}) scale(${k} ${-k})`, class: 'staff__note' }));
  const keys = ['key--gold', 'key--silver', 'key--learning'];
  keys.forEach((cls, i) => {
    const g = svg('g', { class: `key ${cls}` });
    g.append(svg('rect', { x: 114 + i * 15, y: 8, width: 13, height: 44, rx: 2.5, class: 'key__body' }));
    if (cls === 'key--learning') g.append(svg('rect', { x: 116 + i * 15, y: 34, width: 9, height: 15, rx: 1.5, class: 'key__meter' }));
    s.append(g);
  });
  return s;
}

function preview(theme: Theme): HTMLElement {
  const box = h(
    'span',
    { class: 'theme-preview', 'aria-hidden': 'true' },
    h('span', { class: 'theme-preview__card' }, miniScene()),
    h('span', { class: 'theme-preview__bar' }, h('span', { class: 'theme-preview__btn' }, 'Start ▶'), h('span', { class: 'theme-preview__mascot' }, theme.mascot)),
  );
  // Scope the theme's tokens to this box so it previews itself, whatever the current theme is.
  for (const [name, value] of Object.entries(themeVars(theme))) box.style.setProperty(name, value);
  box.style.colorScheme = theme.dark ? 'dark' : 'light';
  return box;
}

export interface ThemePickerOptions {
  settings: Settings;
  save: () => void;
  onDone: () => void;
}

export function renderThemePicker({ settings, save, onDone }: ThemePickerOptions): HTMLElement {
  const current = getTheme(settings.theme).id;
  const cards: HTMLButtonElement[] = [];

  const select = (theme: Theme, focus: boolean) => {
    settings.theme = theme.id as Settings['theme'];
    save();
    applyTheme(theme);
    for (const card of cards) {
      const on = card.dataset.themeId === theme.id;
      card.setAttribute('aria-checked', String(on));
      card.tabIndex = on ? 0 : -1;
      if (on && focus) card.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const i = cards.indexOf(e.currentTarget as HTMLButtonElement);
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: cards.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(THEMES[(next + THEMES.length) % THEMES.length]!, true);
  };

  for (const theme of THEMES) {
    const on = theme.id === current;
    cards.push(
      h(
        'button',
        {
          class: 'theme-card',
          role: 'radio',
          'aria-checked': String(on),
          'aria-label': theme.name,
          tabindex: on ? 0 : -1,
          'data-theme-id': theme.id,
          'data-autofocus': on,
          onClick: () => select(theme, false),
          onKeydown: onKeyDown,
        },
        preview(theme),
        h('span', { class: 'theme-card__name' }, theme.name, h('span', { class: 'theme-card__check', 'aria-hidden': 'true' }, '✓')),
        h('span', { class: 'theme-card__blurb' }, theme.blurb),
      ) as HTMLButtonElement,
    );
  }

  return h(
    'main',
    { class: 'screen themes' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', onClick: onDone }, '←'),
      h('h1', { class: 'title', id: 'theme-title' }, '🎨 Pick a theme'),
    ),
    h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-labelledby': 'theme-title' }, ...cards),
    h('nav', { class: 'row themes__done' }, h('button', { class: 'primary big', onClick: onDone }, 'Done')),
  );
}
