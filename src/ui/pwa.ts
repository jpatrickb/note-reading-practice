// Install / update / storage-durability UI. The home screen shows at most a couple of small,
// dismissible banners; the Save screen says how safe the progress on this device is.

import './pwa.css';
import { durability, installTip, parseDismissedAt } from '../core/install';
import { pwa } from '../pwa/client';
import { h } from './dom';

const DISMISSED_KEY = 'nrp:v1:installTipDismissedAt';
const TRANSFER_KEY = 'nrp:v1:transferTipDismissed';

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the tip just comes back next time.
  }
}

/** Safari's share icon (a box with an arrow), drawn inline so kids can spot the real button. */
function shareIcon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 24');
  svg.setAttribute('class', 'share-icon');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Share');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M10 2v13M5.5 6.5 10 2l4.5 4.5M6.5 10H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 22h12a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 16 10h-2.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export interface HomeBannerOptions {
  /** The kid has some progress on this device (hides the "played in Safari before?" tip). */
  hasProgress: boolean;
  /** Open the Save / load screen. */
  onLoadCode: () => void;
}

let slot: HTMLElement | null = null;
let slotOptions: HomeBannerOptions | null = null;

function banner(testId: string, body: (Node | string)[], ...actions: HTMLElement[]): HTMLElement {
  return h('div', { class: 'pwa-banner', role: 'note', 'data-testid': testId }, h('p', { class: 'pwa-banner__text' }, ...body), h('div', { class: 'pwa-banner__actions' }, ...actions));
}

function fillSlot(): void {
  if (!slot || !slotOptions) return;
  const opts = slotOptions;
  const items: HTMLElement[] = [];

  if (pwa.updateReady) {
    items.push(
      banner('update-ready', ['✨ A new version of Note Reader is ready.'], h('button', { class: 'primary', onClick: () => pwa.applyUpdate() }, 'Tap to refresh')),
    );
  }

  const standalone = isStandalone();
  const tip = installTip({ ios: isIOS(), standalone, canPrompt: pwa.canPrompt, dismissedAt: parseDismissedAt(read(DISMISSED_KEY)), now: Date.now() });
  const notNow = h(
    'button',
    {
      class: 'link-btn',
      onClick: () => {
        write(DISMISSED_KEY, String(Date.now()));
        fillSlot();
      },
    },
    'Not now',
  );
  if (tip === 'ios') {
    items.push(
      banner(
        'install-tip',
        [
          '📌 Keep your progress safe: put Note Reader on your Home Screen. Tap ',
          h('strong', { class: 'nowrap' }, 'Share ', shareIcon()),
          ' (it may be under ',
          h('strong', {}, '⋯'),
          '), then ',
          h('strong', {}, 'Add to Home Screen'),
          '.',
        ],
        notNow,
      ),
    );
  } else if (tip === 'prompt') {
    items.push(
      banner(
        'install-tip',
        ['📌 Install Note Reader to keep your progress safe and play without the internet.'],
        h('button', { class: 'primary', onClick: () => void pwa.promptInstall() }, 'Install app'),
        notNow,
      ),
    );
  }

  // Home Screen apps on iPad keep their own storage, separate from Safari's.
  if (standalone && !opts.hasProgress && !read(TRANSFER_KEY)) {
    items.push(
      banner(
        'transfer-tip',
        ['👋 Played before in Safari? Your keys stay there. In Safari, open ', h('strong', {}, '💾 Save'), ' to get your progress code, then load it here.'],
        h('button', { class: 'secondary', onClick: opts.onLoadCode }, 'Load a code'),
        h(
          'button',
          {
            class: 'link-btn',
            onClick: () => {
              write(TRANSFER_KEY, '1');
              fillSlot();
            },
          },
          'OK',
        ),
      ),
    );
  }

  slot.replaceChildren(...items);
  slot.hidden = items.length === 0;
}

pwa.subscribe(() => {
  if (slot?.isConnected) fillSlot();
});

/**
 * Banners for the home screen only: install tip, "new version ready", and the Safari transfer tip.
 * Because they live on the home screen, an update prompt can never interrupt a kid mid-session.
 */
export function homeBanners(opts: HomeBannerOptions): HTMLElement {
  slot = h('div', { class: 'pwa-banners' });
  slotOptions = opts;
  fillSlot();
  return slot;
}

/** The Save screen card: is this device going to keep the kid's progress? */
export function durabilityCard(): HTMLElement {
  const text = h('p', { class: 'durability__text' }, '…');
  const card = h('section', { class: 'card durability', 'data-testid': 'durability' }, text);
  const show = (persisted: boolean | null) => {
    const d = durability({ persisted, ios: isIOS(), standalone: isStandalone() });
    card.dataset.level = d.level;
    text.textContent = d.text;
    if (d.suggestInstall) {
      card.append(h('p', { class: 'muted' }, 'To add it: tap ', h('strong', { class: 'nowrap' }, 'Share ', shareIcon()), ', then ', h('strong', {}, 'Add to Home Screen'), '.'));
    }
  };
  const check = navigator.storage?.persisted?.bind(navigator.storage);
  if (!check) show(null);
  else
    check()
      .then((p) => show(p))
      .catch(() => show(null));
  return card;
}
