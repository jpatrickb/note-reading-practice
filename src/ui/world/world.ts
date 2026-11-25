// Mounts the current theme's illustrated world behind the app and manages its motion:
// - Calm mode (setting or OS reduced motion) → html[data-calm="true"]: no ambient motion at all.
// - Hidden tab → html[data-hidden]: every ambient animation pauses.
// - During a question (data-mode="play"), sky sprites hold still, and the low ground sprites keep
//   moving only while they are clear of the staff card (guardStaff). Nothing moves behind the staff.

import { prefersReducedMotion, onReducedMotionChange } from './fx';
import { type Sprite, groundViewBox, sceneFor } from './scenes';

export const THEME_EVENT = 'nrp:themechange';

let userCalm = false;
let host: HTMLElement | null = null;
let mountedTheme = '';

function applyCalm(): void {
  document.documentElement.dataset.calm = String(userCalm || prefersReducedMotion());
}

/** Turn Calm mode on/off from the setting (the OS reduced-motion preference also forces it on). */
export function setCalm(on: boolean): void {
  userCalm = on;
  applyCalm();
}

function sprite(s: Sprite): string {
  const vars = `${s.dur ? `--d:${s.dur}s;` : ''}${s.dur2 ? `--d2:${s.dur2}s;` : ''}${s.delay ? `--dl:${s.delay}s;` : ''}`;
  return (
    `<div class="amb ${s.move ?? 'amb--still'}${s.wide ? ' amb--wide' : ''}" data-zone="${s.zone}" style="${s.pos};${vars}">` +
    `<svg class="amb__art ${s.inner ?? ''}" viewBox="${s.vb}" preserveAspectRatio="xMidYMid slice" focusable="false">${s.art}</svg></div>`
  );
}

/** Render (or re-render) the world for a theme. */
export function renderWorld(themeId: string): void {
  if (!host?.isConnected) {
    host = document.createElement('div');
    host.className = 'world';
    host.setAttribute('aria-hidden', 'true');
    document.body.prepend(host);
    mountedTheme = '';
  }
  if (mountedTheme === themeId) return;
  mountedTheme = themeId;
  const scene = sceneFor(themeId);
  host.dataset.world = themeId;
  host.innerHTML =
    scene.sprites.map(sprite).join('') +
    `<svg class="world__ground" viewBox="${groundViewBox}" preserveAspectRatio="xMidYMax slice" focusable="false">${scene.ground}</svg>`;
}

/** Which screen is showing: 'play' quiets the world while a question is up. */
export function setWorldMode(mode: string): void {
  if (!host) return;
  host.dataset.mode = mode === 'play' || mode === 'letters' ? 'play' : mode;
  if (host.dataset.mode !== 'play') delete host.dataset.still;
}

/**
 * Keep ground sprites still if any of them could pass behind the staff card (short screens, phones in
 * landscape). Called whenever a question is shown and on resize.
 */
export function guardStaff(card: Element | null): void {
  if (!host || !card) return;
  const r = card.getBoundingClientRect();
  const overlap = [...host.querySelectorAll<HTMLElement>('.amb[data-zone="ground"]')].some((el) => {
    const b = el.getBoundingClientRect();
    return b.top < r.bottom && b.bottom > r.top;
  });
  if (overlap) host.dataset.still = 'true';
  else delete host.dataset.still;
}

/** Call once at startup, after the theme is applied. */
export function initWorld(calm: boolean): void {
  userCalm = calm;
  applyCalm();
  onReducedMotionChange(applyCalm);
  renderWorld(document.documentElement.dataset.theme ?? 'sunny');
  document.addEventListener(THEME_EVENT, (e) => renderWorld((e as CustomEvent<string>).detail));
  const vis = () => {
    if (document.hidden) document.documentElement.dataset.hidden = 'true';
    else delete document.documentElement.dataset.hidden;
  };
  // Rotating an iPad mid-question changes the layout: re-check what could pass behind the staff.
  window.addEventListener('resize', () => {
    if (host?.dataset.mode === 'play') guardStaff(document.querySelector('.staff-card, .lm-card'));
  });
  document.addEventListener('visibilitychange', vis);
  vis();
}
