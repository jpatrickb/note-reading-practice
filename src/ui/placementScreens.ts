// The two screens around the placement round: the offer (before) and the result (after). The round
// itself is the play shell with `host.placement` set. Copy is for a 6-year-old and a 14-year-old.

import type { PlacementRun } from '../core/placement';
import { resultText } from '../core/placementFlow';
import { getTheme } from '../core/themes';
import { h } from './dom';
import type { UiMode } from './mode';
import './placement.css';
import { icon } from './world/icons';
import { renderMascot } from './world/mascots';

const mascot = () => renderMascot(getTheme(document.documentElement.dataset.theme).id, { mood: 'happy', alive: true, cls: 'placement__mascot' });

/** Offered, not forced: both choices are equally easy to tap. */
export function renderPlacementOffer(o: { mode: UiMode; lane: string; onPlace(): void; onBegin(): void; onBack(): void }): HTMLElement {
  return h(
    'main',
    { class: 'screen placement', 'data-testid': 'placement-offer' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onClick: o.onBack }, icon('back')), h('h1', { class: 'title' }, o.mode.title)),
    h(
      'section',
      { class: 'card placement__card' },
      mascot(),
      h('h2', {}, 'Ready to play?'),
      o.mode.lanes === 'clefs' && h('p', { class: 'placement__lane', 'data-testid': 'placement-lane' }, `${o.lane[0]!.toUpperCase()}${o.lane.slice(1)} clef`),
      h('p', {}, 'Show me what you know! Not sure? Tap ?.'),
      h(
        'div',
        { class: 'placement__choices' },
        h('button', { class: 'secondary big', 'data-testid': 'placement-start', onClick: o.onPlace }, 'Show me what you know'),
        h('button', { class: 'secondary big', 'data-testid': 'placement-skip', onClick: o.onBegin }, 'Start from the beginning'),
      ),
    ),
  );
}

/** After the round: where the kid starts. No score, no medals. */
export function renderPlacementResult(o: { mode: UiMode; run: PlacementRun; onGo(): void }): HTMLElement {
  const { title, body } = resultText(o.run, { medal: o.mode.words.medal, line: (id) => o.mode.placedLine(id) });
  return h(
    'main',
    { class: 'screen placement', 'data-testid': 'placement-result' },
    h('header', { class: 'topbar' }, h('h1', { class: 'title' }, o.mode.title)),
    h(
      'section',
      { class: 'card placement__card' },
      mascot(),
      h('h2', {}, title),
      h('p', { class: 'placement__line', 'data-testid': 'placement-line' }, body),
      h('div', { class: 'placement__choices' }, h('button', { class: 'primary big', 'data-testid': 'placement-go', 'data-autofocus': true, onClick: o.onGo }, h('span', {}, "Let's play"), icon('play', 'btn-icon'))),
    ),
  );
}
