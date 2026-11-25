// The theme picker screen: one big card per theme with a live mini-preview drawn in that theme's
// own colors. Picking applies the theme to the whole app immediately and saves it.
// Keyboard: a radio group (Tab in, arrow keys / Home / End to move and pick); touch: tap a card.

import type { Settings } from '../core/storage';
import { THEMES, type Theme, getTheme, themeVars } from '../core/themes';
import { GLYPHS } from '../render/glyphs';
import { h } from './dom';
import { applyTheme } from './theme';
import { prefersReducedMotion } from './world/fx';
import { icon } from './world/icons';
import { renderMascot } from './world/mascots';
import { groundViewBox, sceneFor } from './world/scenes';

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

/** The bottom of the theme's world, as a strip behind the preview. */
function miniGround(theme: Theme): SVGSVGElement {
  const g = svg('svg', { viewBox: groundViewBox, preserveAspectRatio: 'xMidYMax slice', class: 'theme-preview__ground', 'aria-hidden': 'true' });
  g.innerHTML = sceneFor(theme.id).ground;
  return g;
}

function preview(theme: Theme): HTMLElement {
  const box = h(
    'span',
    { class: 'theme-preview', 'aria-hidden': 'true' },
    miniGround(theme),
    h('span', { class: 'theme-preview__card' }, miniScene()),
    h('span', { class: 'theme-preview__bar' }, h('span', { class: 'theme-preview__btn' }, 'Start')),
    renderMascot(theme.id, { mood: 'happy', cls: 'theme-preview__mascot' }),
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
        h('span', { class: 'theme-card__name' }, theme.name, h('span', { class: 'theme-card__check', 'aria-hidden': 'true' }, icon('check'))),
        h('span', { class: 'theme-card__blurb' }, `${theme.blurb} · ${theme.mascot}`),
      ) as HTMLButtonElement,
    );
  }

  return h(
    'main',
    { class: 'screen themes' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', onClick: onDone }, icon('back')),
      h('h1', { class: 'title', id: 'theme-title' }, icon('palette', 'title__icon'), 'Pick a theme'),
    ),
    h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-labelledby': 'theme-title' }, ...cards),
    calmSwitch(settings, save),
    h('nav', { class: 'row themes__done' }, h('button', { class: 'primary big', onClick: onDone }, 'Done')),
  );
}

/** Calm mode: a still background and small celebrations (for kids and teachers who want less motion). */
function calmSwitch(settings: Settings, save: () => void): HTMLElement {
  const forced = prefersReducedMotion();
  const sw = h(
    'button',
    {
      class: 'switch',
      role: 'switch',
      'aria-checked': String(!!settings.calm || forced),
      'aria-labelledby': 'calm-title',
      'aria-describedby': 'calm-desc',
      'data-testid': 'calm-toggle',
      disabled: forced,
      onClick: () => {
        settings.calm = !settings.calm;
        sw.setAttribute('aria-checked', String(settings.calm));
        save();
      },
    },
    h('span', { class: 'switch__knob' }),
  );
  return h(
    'section',
    { class: 'card calm-card' },
    h('span', { class: 'calm-card__icon' }, icon('calm')),
    h(
      'div',
      { class: 'calm-card__text' },
      h('h2', { id: 'calm-title' }, 'Calm mode'),
      h(
        'p',
        { class: 'muted', id: 'calm-desc' },
        forced ? 'Your device asks for less motion, so the game is always calm here.' : 'Less motion: a still background, no confetti or flying keys.',
      ),
    ),
    sw,
  );
}
