// The home screen's mode chooser: cards grouped under short headings, so it scales from two modes to
// a dozen. The chosen card is marked by a check badge and a heavy outline as well as its color; a
// locked mode stays on screen with its reason (it is never hidden) and cannot be chosen.

import type { Profile } from '../core/codec';
import { h } from './dom';
import { MODE_GROUPS, type UiMode, modeIcon } from './mode';
import { icon } from './world/icons';
import './modeChooser.css';

export interface ModeChooserOptions {
  modes: readonly UiMode[];
  profile: Profile;
  /** Id of the chosen mode. */
  selected: string;
  onSelect(id: string): void;
}

export function renderModeChooser({ modes, profile, selected, onSelect }: ModeChooserOptions): HTMLElement {
  const groups = MODE_GROUPS.map((g) => ({ ...g, modes: modes.filter((m) => m.group === g.id) })).filter((g) => g.modes.length > 0);
  return h(
    'div',
    { class: 'modes', role: 'radiogroup', 'aria-label': 'Game', 'data-testid': 'mode-chooser', onKeydown: onKey(onSelect) },
    ...groups.map((g) => {
      const headingId = `mode-group-${g.id}`;
      return h(
        'section',
        { class: 'mode-group', 'aria-labelledby': headingId },
        h('h3', { class: 'mode-group__title', id: headingId }, g.title),
        h('div', { class: 'mode-grid' }, ...g.modes.map((m) => card(m, profile, m.id === selected, onSelect))),
      );
    }),
  );
}

function card(mode: UiMode, profile: Profile, on: boolean, onSelect: (id: string) => void): HTMLElement {
  const avail = mode.availability(profile);
  const locked = !avail.ok;
  const reasonId = `mode-reason-${mode.id}`;
  return h(
    'button',
    {
      class: `mode-card${on ? ' mode-card--on' : ''}${locked ? ' mode-card--locked' : ''}`,
      'data-mode': mode.id,
      role: 'radio',
      'aria-checked': String(on),
      // One tab stop for the whole group: the chosen card (arrow keys move between the open ones).
      tabindex: on ? '0' : '-1',
      // Stays focusable and announced, like a locked piano key (D75); it just does nothing.
      'aria-disabled': locked ? 'true' : undefined,
      'aria-describedby': locked ? reasonId : undefined,
      onClick: () => {
        if (!locked) onSelect(mode.id);
      },
    },
    h('span', { class: 'mode-card__head' }, h('span', { class: 'mode-card__icon' }, modeIcon(mode)), badge(on, locked)),
    h('span', { class: 'mode-card__title' }, mode.title),
    locked
      ? h('span', { class: 'mode-card__blurb mode-card__reason', id: reasonId }, avail.reason)
      : h('span', { class: 'mode-card__blurb' }, mode.blurb),
  );
}

/** The chosen card shows a check, a locked one a lock: state is never carried by color alone. */
function badge(on: boolean, locked: boolean): HTMLElement | false {
  // Decorative: aria-checked, aria-disabled and the reason already say it to a screen reader.
  if (locked) return h('span', { class: 'mode-card__badge' }, icon('lock'));
  if (on) return h('span', { class: 'mode-card__badge' }, icon('check'));
  return false;
}

/** Arrow keys move through the open cards and choose as they go, like any radio group. */
function onKey(onSelect: (id: string) => void) {
  return (e: Event) => {
    const k = (e as KeyboardEvent).key;
    const step = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const open = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.mode-card:not([aria-disabled="true"])')];
    const at = open.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const next = open[(at + step + open.length) % open.length]!;
    onSelect(next.dataset.mode!);
  };
}
